// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Interface Adapters — ViewModel of the orders screen: list, create, edit and cancel orders.
// It decides how things show (sorting, texts as i18n keys, which row is being edited, busy flags), never a
// business rule: whether an order can be edited or cancelled comes ready from the API.
import type { IdGenerator } from '../../../application/ports/IdGenerator.ts';
import type { Monitoring } from '../../../application/ports/Monitoring.ts';
import type { Order, OrderSide, OrdersGateway } from '../../../application/ports/OrdersGateway.ts';
import { SessionExpiredError } from '../../../application/ports/Session.ts';
import type { Toaster } from '../../../application/ports/Toaster.ts';
import type { FieldErrors, Result } from '../../../application/Result.ts';
import { assertNever } from '../../../application/assertNever.ts';
import { ViewModel } from '../../view-models/ViewModel.ts';

export type OrderDraft = {
  readonly symbol: string;
  readonly side: OrderSide;
  readonly quantity: string;
  readonly price: string;
};

export type EditDraft = {
  readonly quantity: string;
  readonly price: string;
};

export type OrderRow = {
  readonly id: string;
  readonly symbol: string;
  readonly sideKey: string;
  readonly quantityText: string;
  readonly priceText: string;
  readonly statusKey: string;
  readonly canEdit: boolean;
  readonly canCancel: boolean;
  // The fields being edited on this row, or null when it isn't.
  readonly edit: EditDraft | null;
};

// Field name → i18n key of its message (`errors.<code>`).
export type FieldErrorKeys = Readonly<Record<string, string>>;

export type OrdersState = {
  readonly rows: readonly OrderRow[];
  readonly loading: boolean;
  // A create, edit or cancel is running: the buttons are disabled.
  readonly busy: boolean;
  readonly emptyKey: string | null;
  readonly errorKey: string | null;
  readonly canRetry: boolean;
  readonly draft: OrderDraft;
  readonly draftErrors: FieldErrorKeys;
  readonly editErrors: FieldErrorKeys;
};

const SIDE_OPTIONS: readonly { readonly value: OrderSide; readonly labelKey: string }[] = [
  { value: 'buy', labelKey: 'orders.side.buy' },
  { value: 'sell', labelKey: 'orders.side.sell' }
];

const emptyDraft: OrderDraft = { symbol: '', side: 'buy', quantity: '', price: '' };

const initialState: OrdersState = {
  rows: [],
  loading: false,
  busy: false,
  emptyKey: null,
  errorKey: null,
  canRetry: false,
  draft: emptyDraft,
  draftErrors: {},
  editErrors: {}
};

type Editing = { readonly id: string; readonly draft: EditDraft };

export class OrdersViewModel extends ViewModel<OrdersState> {
  // Fixed, so a field and not part of the state; the View reads it as vm.sideOptions.
  readonly sideOptions = SIDE_OPTIONS;
  private orders: readonly Order[] = [];
  private editing: Editing | null = null;
  // The client order id of the order being sent. Kept while no answer came back (a resend must not place
  // the order twice); cleared once the API answers, so the next order gets a new one.
  private clientOrderId: string | null = null;

  constructor(
    private readonly gateway: OrdersGateway,
    private readonly toaster: Toaster,
    private readonly monitoring: Monitoring,
    private readonly ids: IdGenerator
  ) {
    super(initialState);
  }

  async load(): Promise<void> {
    this.set({ ...this.state, loading: true, errorKey: null, canRetry: false });
    await this.attempt(async () => {
      const result = await this.gateway.list();
      if (result.status === 'success') {
        this.showOrders(result.value);
        return;
      }
      this.showFailure(result, 'list');
    });
  }

  retry(): Promise<void> {
    return this.load();
  }

  changeDraft(changes: Partial<Omit<OrderDraft, 'side'>>): void {
    this.set({ ...this.state, draft: { ...this.state.draft, ...changes } });
  }

  // The select gives a string: anything but 'sell' is a buy.
  chooseSide(value: string): void {
    this.set({ ...this.state, draft: { ...this.state.draft, side: value === 'sell' ? 'sell' : 'buy' } });
  }

  async create(): Promise<void> {
    this.startBusy();
    const draft = this.state.draft;
    this.clientOrderId ??= this.ids.newId();
    const clientOrderId = this.clientOrderId;
    await this.attempt(async () => {
      const result = await this.gateway.create({
        clientOrderId,
        symbol: draft.symbol,
        side: draft.side,
        quantity: toNumber(draft.quantity),
        price: toNumber(draft.price)
      });
      this.clientOrderId = null; // the API answered
      if (result.status === 'success') {
        const placed = result.value;
        this.set({ ...this.state, draft: emptyDraft });
        // Newest first, like the API. A resend answers an order that may already be listed.
        this.showOrders([placed, ...this.orders.filter((o) => o.id !== placed.id)]);
        this.toaster.show('feedback.order-created');
        return;
      }
      this.showFailure(result, 'draft');
    });
  }

  startEdit(id: string): void {
    const order = this.orders.find((o) => o.id === id);
    if (!order) return;
    this.editing = { id, draft: { quantity: String(order.quantity), price: String(order.price) } };
    this.set({ ...this.state, editErrors: {}, errorKey: null });
    this.showOrders(this.orders);
  }

  changeEdit(changes: Partial<EditDraft>): void {
    if (!this.editing) return;
    this.editing = { ...this.editing, draft: { ...this.editing.draft, ...changes } };
    this.showOrders(this.orders);
  }

  stopEdit(): void {
    this.editing = null;
    this.set({ ...this.state, editErrors: {} });
    this.showOrders(this.orders);
  }

  async saveEdit(): Promise<void> {
    const editing = this.editing; // copy, then narrow with a guard; never `this.editing!`
    if (!editing) return;
    this.startBusy();
    await this.attempt(async () => {
      const result = await this.gateway.edit(editing.id, {
        quantity: toNumber(editing.draft.quantity),
        price: toNumber(editing.draft.price)
      });
      if (result.status === 'success') {
        this.editing = null;
        this.replaceOrder(result.value);
        this.toaster.show('feedback.order-updated');
        return;
      }
      this.showFailure(result, 'edit');
    });
  }

  async cancelOrder(id: string): Promise<void> {
    this.startBusy();
    await this.attempt(async () => {
      const result = await this.gateway.cancel(id);
      if (result.status === 'success') {
        this.replaceOrder(result.value);
        this.toaster.show('feedback.order-cancelled');
        return;
      }
      this.showFailure(result, 'list');
    });
  }

  private startBusy(): void {
    this.set({ ...this.state, busy: true, errorKey: null, canRetry: false, draftErrors: {}, editErrors: {} });
  }

  // The screen's safety net: whatever happens, the flags come down; an unexpected failure is shown and
  // reported, an expired session is not (the HTTP adapter already sent the user to sign in).
  private async attempt(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      if (!(error instanceof SessionExpiredError)) {
        this.monitoring.report(error);
        this.set({ ...this.state, errorKey: 'errors.unexpected', canRetry: true });
      }
    } finally {
      this.set({ ...this.state, loading: false, busy: false });
    }
  }

  // Validation codes go under their fields (on the form that was sent); the others go to the banner.
  private showFailure(
    result: Exclude<Result<unknown>, { status: 'success' }>,
    form: 'list' | 'draft' | 'edit'
  ): void {
    switch (result.status) {
      case 'validation': {
        const fields = toErrorKeys(result.fields);
        this.set({
          ...this.state,
          errorKey: errorKey(result.error),
          draftErrors: form === 'draft' ? fields : {},
          editErrors: form === 'edit' ? fields : {}
        });
        return;
      }
      case 'notFound':
      case 'conflict':
        this.set({ ...this.state, errorKey: errorKey(result.error) });
        return;
      default:
        assertNever(result);
    }
  }

  private replaceOrder(updated: Order): void {
    this.showOrders(this.orders.map((order) => (order.id === updated.id ? updated : order)));
  }

  private showOrders(orders: readonly Order[]): void {
    this.orders = orders;
    this.set({
      ...this.state,
      rows: orders.map((order) => toRow(order, this.editing)),
      emptyKey: orders.length === 0 ? 'orders.empty' : null
    });
  }
}

const quantityFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const priceFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 });

function toRow(order: Order, editing: Editing | null): OrderRow {
  return {
    id: order.id,
    symbol: order.symbol,
    sideKey: `orders.side.${order.side}`,
    quantityText: quantityFormat.format(order.quantity),
    priceText: priceFormat.format(order.price),
    statusKey: `orders.status.${order.status}`,
    canEdit: order.canEdit,
    canCancel: order.canCancel,
    edit: editing?.id === order.id ? editing.draft : null
  };
}

function errorKey(code: string): string {
  return `errors.${code}`;
}

function toErrorKeys(fields: FieldErrors = {}): FieldErrorKeys {
  return Object.fromEntries(Object.entries(fields).map(([field, code]) => [field, errorKey(code)]));
}

// The API validates the numbers; an empty box is sent as 0 so it answers `must-be-positive`.
function toNumber(text: string): number {
  return text.trim() === '' ? 0 : Number(text);
}
