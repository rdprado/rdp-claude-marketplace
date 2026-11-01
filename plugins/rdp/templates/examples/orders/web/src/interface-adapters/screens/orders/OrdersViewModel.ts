// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Interface Adapters — ViewModel of the orders screen: list and create orders.
// It decides how things show (texts as i18n keys, number formats, busy flags), never a business rule:
// those live in the API.
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

export type OrderRow = {
  readonly id: string;
  readonly symbol: string;
  readonly sideKey: string;
  readonly quantityText: string;
  readonly priceText: string;
};

// Field name → i18n key of its message (`errors.<code>`).
export type FieldErrorKeys = Readonly<Record<string, string>>;

export type OrdersState = {
  readonly rows: readonly OrderRow[];
  readonly loading: boolean;
  // A create is running: the button is disabled.
  readonly busy: boolean;
  readonly emptyKey: string | null;
  readonly errorKey: string | null;
  readonly canRetry: boolean;
  readonly draft: OrderDraft;
  readonly draftErrors: FieldErrorKeys;
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
  draftErrors: {}
};

export class OrdersViewModel extends ViewModel<OrdersState> {
  // Fixed, so a field and not part of the state; the View reads it as vm.sideOptions.
  readonly sideOptions = SIDE_OPTIONS;
  private orders: readonly Order[] = [];
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
    await this.attempt(
      async () => {
        const result = await this.gateway.list();
        if (result.status === 'success') {
          this.showOrders(result.value);
          return;
        }
        this.showFailure(result, 'list');
      },
      { canRetry: true }
    );
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
    // A new attempt: no message from the last one, and nothing to retry until this one fails.
    this.set({ ...this.state, busy: true, errorKey: null, canRetry: false, draftErrors: {} });
    const draft = this.state.draft;
    this.clientOrderId ??= this.ids.newId();
    const clientOrderId = this.clientOrderId;
    await this.attempt(
      async () => {
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
      },
      { canRetry: false }
    );
  }

  // The screen's safety net: whatever happens, the flags come down; an unexpected failure is shown and
  // reported, an expired session is not (the HTTP adapter already sent the user to sign in).
  // The retry button reloads the list, so only a failed load offers it.
  private async attempt(work: () => Promise<void>, { canRetry }: { canRetry: boolean }): Promise<void> {
    try {
      await work();
    } catch (error) {
      if (!(error instanceof SessionExpiredError)) {
        this.monitoring.report(error);
        this.set({ ...this.state, errorKey: 'errors.unexpected', canRetry });
      }
    } finally {
      this.set({ ...this.state, loading: false, busy: false });
    }
  }

  // Validation codes go under their fields (on the form that was sent); the others go to the banner.
  private showFailure(result: Exclude<Result<unknown>, { status: 'success' }>, form: 'list' | 'draft'): void {
    switch (result.status) {
      case 'validation': {
        const fields = toErrorKeys(result.fields);
        this.set({
          ...this.state,
          errorKey: errorKey(result.error),
          draftErrors: form === 'draft' ? fields : {}
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

  private showOrders(orders: readonly Order[]): void {
    this.orders = orders;
    this.set({
      ...this.state,
      rows: orders.map(toRow),
      emptyKey: orders.length === 0 ? 'orders.empty' : null
    });
  }
}

const quantityFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const priceFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 });

function toRow(order: Order): OrderRow {
  return {
    id: order.id,
    symbol: order.symbol,
    sideKey: `orders.side.${order.side}`,
    quantityText: quantityFormat.format(order.quantity),
    priceText: priceFormat.format(order.price)
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
