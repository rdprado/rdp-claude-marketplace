// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it, vi } from 'vitest';
import type { IdGenerator } from '../../../application/ports/IdGenerator.ts';
import type { Monitoring } from '../../../application/ports/Monitoring.ts';
import type { Order, OrdersGateway } from '../../../application/ports/OrdersGateway.ts';
import { SessionExpiredError } from '../../../application/ports/Session.ts';
import type { Toaster } from '../../../application/ports/Toaster.ts';
import { Result } from '../../../application/Result.ts';
import { OrdersViewModel } from './OrdersViewModel.ts';

const CREATED = new Date('2026-10-28T12:00:00Z');

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o-1',
    symbol: 'PETR4',
    side: 'buy',
    quantity: 1000,
    price: 37.5,
    status: 'open',
    canEdit: true,
    canCancel: true,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides
  };
}

// Every method fails loudly unless the test sets it.
function gateway(overrides: Partial<OrdersGateway> = {}): OrdersGateway {
  const unexpected = () => Promise.reject(new Error('not expected in this test'));
  return { list: unexpected, create: unexpected, edit: unexpected, cancel: unexpected, ...overrides };
}

function ports() {
  const toaster = { show: vi.fn() } satisfies Toaster;
  const monitoring = { report: vi.fn(), recordRequest: vi.fn() } satisfies Monitoring;
  let drawn = 0;
  const ids = { newId: () => `id-${++drawn}` } satisfies IdGenerator;
  return { toaster, monitoring, ids };
}

async function loadedWith(orders: readonly Order[], overrides: Partial<OrdersGateway> = {}) {
  const { toaster, monitoring, ids } = ports();
  const vm = new OrdersViewModel(
    gateway({ list: () => Promise.resolve(Result.success(orders)), ...overrides }),
    toaster,
    monitoring,
    ids
  );
  await vm.load();
  return { vm, toaster, monitoring };
}

describe('OrdersViewModel', () => {
  describe('load', () => {
    it('shows each order ready to display, in the order the API sent them', async () => {
      // Act
      const { vm } = await loadedWith([
        order({ id: 'o-2', symbol: 'VALE3', side: 'sell', quantity: 200, price: 61.2, canEdit: false }),
        order({ id: 'o-1', status: 'cancelled', canEdit: false, canCancel: false })
      ]);

      // Assert
      expect(vm.state.rows).toEqual([
        {
          id: 'o-2',
          symbol: 'VALE3',
          sideKey: 'orders.side.sell',
          quantityText: '200',
          priceText: '61,20',
          statusKey: 'orders.status.open',
          canEdit: false,
          canCancel: true,
          edit: null
        },
        {
          id: 'o-1',
          symbol: 'PETR4',
          sideKey: 'orders.side.buy',
          quantityText: '1.000',
          priceText: '37,50',
          statusKey: 'orders.status.cancelled',
          canEdit: false,
          canCancel: false,
          edit: null
        }
      ]);
      expect(vm.state.loading).toBe(false);
      expect(vm.state.emptyKey).toBeNull();
    });

    it('is loading while the request runs', async () => {
      // Arrange
      let loadingDuringCall: boolean | null = null;
      const { toaster, monitoring, ids } = ports();
      const vm: OrdersViewModel = new OrdersViewModel(
        gateway({
          list: () => {
            loadingDuringCall = vm.state.loading;
            return Promise.resolve(Result.success([]));
          }
        }),
        toaster,
        monitoring,
        ids
      );

      // Act
      await vm.load();

      // Assert
      expect(loadingDuringCall).toBe(true);
      expect(vm.state.loading).toBe(false);
    });

    it('shows the empty message when there are no orders', async () => {
      // Act
      const { vm } = await loadedWith([]);

      // Assert
      expect(vm.state.emptyKey).toBe('orders.empty');
    });

    it('shows the unexpected message, offers a retry and reports when the request fails', async () => {
      // Arrange
      const failure = new Error('network down');
      const { toaster, monitoring, ids } = ports();
      const vm = new OrdersViewModel(
        gateway({ list: () => Promise.reject(failure) }),
        toaster,
        monitoring,
        ids
      );

      // Act
      await vm.load();

      // Assert
      expect(vm.state.errorKey).toBe('errors.unexpected');
      expect(vm.state.canRetry).toBe(true);
      expect(vm.state.loading).toBe(false);
      expect(monitoring.report).toHaveBeenCalledWith(failure);
    });

    it('stops quietly and does not report an expired session', async () => {
      // Arrange
      const { toaster, monitoring, ids } = ports();
      const vm = new OrdersViewModel(
        gateway({ list: () => Promise.reject(new SessionExpiredError()) }),
        toaster,
        monitoring,
        ids
      );

      // Act
      await vm.load();

      // Assert
      expect(vm.state.loading).toBe(false);
      expect(vm.state.errorKey).toBeNull();
      expect(monitoring.report).not.toHaveBeenCalled();
    });

    it('clears the error and shows the orders when a retry works', async () => {
      // Arrange
      const list = vi
        .fn<OrdersGateway['list']>()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(Result.success([order()]));
      const { toaster, monitoring, ids } = ports();
      const vm = new OrdersViewModel(gateway({ list }), toaster, monitoring, ids);
      await vm.load();

      // Act
      await vm.retry();

      // Assert
      expect(vm.state.errorKey).toBeNull();
      expect(vm.state.canRetry).toBe(false);
      expect(vm.state.rows.map((row) => row.id)).toEqual(['o-1']);
    });
  });

  describe('create', () => {
    it('sends the draft as numbers, puts the new order first, clears the form and confirms', async () => {
      // Arrange
      const create = vi.fn<OrdersGateway['create']>(() =>
        Promise.resolve(Result.success(order({ id: 'o-new' })))
      );
      const { vm, toaster } = await loadedWith([order()], { create });
      vm.changeDraft({ symbol: 'PETR4', quantity: '1000', price: '37.5' });
      vm.chooseSide('sell');

      // Act
      await vm.create();

      // Assert
      expect(create).toHaveBeenCalledWith({
        clientOrderId: 'id-1',
        symbol: 'PETR4',
        side: 'sell',
        quantity: 1000,
        price: 37.5
      });
      expect(vm.state.rows.map((row) => row.id)).toEqual(['o-new', 'o-1']);
      expect(vm.state.draft).toEqual({ symbol: '', side: 'buy', quantity: '', price: '' });
      expect(vm.state.busy).toBe(false);
      expect(toaster.show).toHaveBeenCalledWith('feedback.order-created');
    });

    it('sends an empty number box as 0, so the API answers must-be-positive', async () => {
      // Arrange
      const create = vi.fn<OrdersGateway['create']>(() => Promise.resolve(Result.success(order())));
      const { vm } = await loadedWith([], { create });
      vm.changeDraft({ symbol: 'PETR4', quantity: ' ', price: '' });

      // Act
      await vm.create();

      // Assert
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ quantity: 0, price: 0 }));
    });

    it('shows each field code under its field and keeps the draft when the API rejects it', async () => {
      // Arrange
      const create = () =>
        Promise.resolve(
          Result.validation<Order>('validation-failed', { symbol: 'required', quantity: 'must-be-positive' })
        );
      const { vm, toaster } = await loadedWith([], { create });
      vm.changeDraft({ quantity: '0' });

      // Act
      await vm.create();

      // Assert
      expect(vm.state.errorKey).toBe('errors.validation-failed');
      expect(vm.state.draftErrors).toEqual({
        symbol: 'errors.required',
        quantity: 'errors.must-be-positive'
      });
      expect(vm.state.editErrors).toEqual({});
      expect(vm.state.draft.quantity).toBe('0');
      expect(toaster.show).not.toHaveBeenCalled();
    });

    it('clears the old field messages on the next attempt', async () => {
      // Arrange
      const create = vi
        .fn<OrdersGateway['create']>()
        .mockResolvedValueOnce(Result.validation('validation-failed', { symbol: 'required' }))
        .mockResolvedValueOnce(Result.success(order({ id: 'o-new' })));
      const { vm } = await loadedWith([], { create });
      await vm.create();

      // Act
      await vm.create();

      // Assert
      expect(vm.state.draftErrors).toEqual({});
      expect(vm.state.errorKey).toBeNull();
    });

    it('resends the same client order id after an unexpected failure, so the order is placed once', async () => {
      // Arrange: the first send may have reached the API; only its answer was lost
      const create = vi
        .fn<OrdersGateway['create']>()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(Result.success(order({ id: 'o-new' })));
      const { vm } = await loadedWith([], { create });
      vm.changeDraft({ symbol: 'PETR4', quantity: '100', price: '37.5' });
      await vm.create();

      // Act
      await vm.create();

      // Assert
      const sentIds = create.mock.calls.map(([sent]) => sent.clientOrderId);
      expect(sentIds).toEqual(['id-1', 'id-1']);
    });

    it('draws a new client order id once the API has answered, so the next order is a new one', async () => {
      // Arrange
      const create = vi
        .fn<OrdersGateway['create']>()
        .mockResolvedValueOnce(Result.validation('validation-failed', { symbol: 'required' }))
        .mockResolvedValueOnce(Result.success(order({ id: 'o-new' })))
        .mockResolvedValueOnce(Result.success(order({ id: 'o-next' })));
      const { vm } = await loadedWith([], { create });
      await vm.create();

      // Act
      await vm.create();
      await vm.create();

      // Assert
      const sentIds = create.mock.calls.map(([sent]) => sent.clientOrderId);
      expect(sentIds).toEqual(['id-1', 'id-2', 'id-3']);
    });

    it('shows the order once when a resend answers an order already in the list', async () => {
      // Arrange: the list was reloaded after the first send landed
      const create = () => Promise.resolve(Result.success(order({ id: 'o-1' })));
      const { vm } = await loadedWith([order({ id: 'o-1' })], { create });

      // Act
      await vm.create();

      // Assert
      expect(vm.state.rows.map((row) => row.id)).toEqual(['o-1']);
    });
  });

  describe('edit', () => {
    it('opens the row for editing with the current quantity and price', async () => {
      // Arrange
      const { vm } = await loadedWith([order(), order({ id: 'o-2' })]);

      // Act
      vm.startEdit('o-1');

      // Assert
      expect(vm.state.rows.map((row) => row.edit)).toEqual([{ quantity: '1000', price: '37.5' }, null]);
    });

    it('saves the changes, shows the updated order and closes the row', async () => {
      // Arrange
      const edit = vi.fn<OrdersGateway['edit']>(() =>
        Promise.resolve(Result.success(order({ quantity: 500, price: 38 })))
      );
      const { vm, toaster } = await loadedWith([order()], { edit });
      vm.startEdit('o-1');
      vm.changeEdit({ quantity: '500', price: '38' });

      // Act
      await vm.saveEdit();

      // Assert
      expect(edit).toHaveBeenCalledWith('o-1', { quantity: 500, price: 38 });
      expect(vm.state.rows[0]).toMatchObject({ quantityText: '500', priceText: '38,00', edit: null });
      expect(toaster.show).toHaveBeenCalledWith('feedback.order-updated');
    });

    it('shows the field messages on the edited row when the API rejects the changes', async () => {
      // Arrange
      const edit = () =>
        Promise.resolve(Result.validation<Order>('validation-failed', { price: 'must-be-positive' }));
      const { vm } = await loadedWith([order()], { edit });
      vm.startEdit('o-1');

      // Act
      await vm.saveEdit();

      // Assert
      expect(vm.state.editErrors).toEqual({ price: 'errors.must-be-positive' });
      expect(vm.state.draftErrors).toEqual({});
      expect(vm.state.rows[0]?.edit).not.toBeNull();
    });

    it('shows the banner when the order is no longer open', async () => {
      // Arrange
      const edit = () => Promise.resolve(Result.conflict<Order>('order-not-open'));
      const { vm } = await loadedWith([order()], { edit });
      vm.startEdit('o-1');

      // Act
      await vm.saveEdit();

      // Assert
      expect(vm.state.errorKey).toBe('errors.order-not-open');
      expect(vm.state.busy).toBe(false);
    });

    it('closes the row without saving when the edit is discarded', async () => {
      // Arrange
      const edit = vi.fn<OrdersGateway['edit']>();
      const { vm } = await loadedWith([order()], { edit });
      vm.startEdit('o-1');

      // Act
      vm.stopEdit();
      await vm.saveEdit();

      // Assert
      expect(vm.state.rows[0]?.edit).toBeNull();
      expect(edit).not.toHaveBeenCalled();
    });
  });

  describe('cancelOrder', () => {
    it('shows the cancelled order with the actions the API now allows, and confirms', async () => {
      // Arrange
      const cancel = vi.fn<OrdersGateway['cancel']>(() =>
        Promise.resolve(Result.success(order({ status: 'cancelled', canEdit: false, canCancel: false })))
      );
      const { vm, toaster } = await loadedWith([order()], { cancel });

      // Act
      await vm.cancelOrder('o-1');

      // Assert
      expect(cancel).toHaveBeenCalledWith('o-1');
      expect(vm.state.rows[0]).toMatchObject({
        statusKey: 'orders.status.cancelled',
        canEdit: false,
        canCancel: false
      });
      expect(toaster.show).toHaveBeenCalledWith('feedback.order-cancelled');
    });

    it('shows the banner when the order no longer exists', async () => {
      // Arrange
      const cancel = () => Promise.resolve(Result.notFound<Order>('order-not-found'));
      const { vm, toaster } = await loadedWith([order()], { cancel });

      // Act
      await vm.cancelOrder('o-1');

      // Assert
      expect(vm.state.errorKey).toBe('errors.order-not-found');
      expect(toaster.show).not.toHaveBeenCalled();
    });

    it('is busy while the request runs', async () => {
      // Arrange
      let busyDuringCall: boolean | null = null;
      const { toaster, monitoring, ids } = ports();
      const vm: OrdersViewModel = new OrdersViewModel(
        gateway({
          cancel: () => {
            busyDuringCall = vm.state.busy;
            return Promise.resolve(Result.success(order()));
          }
        }),
        toaster,
        monitoring,
        ids
      );

      // Act
      await vm.cancelOrder('o-1');

      // Assert
      expect(busyDuringCall).toBe(true);
      expect(vm.state.busy).toBe(false);
    });

    it('takes back the retry offer when the next action starts', async () => {
      // Arrange
      const cancel = vi
        .fn<OrdersGateway['cancel']>()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(Result.success(order({ status: 'cancelled' })));
      const { vm } = await loadedWith([order()], { cancel });
      await vm.cancelOrder('o-1');

      // Act
      await vm.cancelOrder('o-1');

      // Assert
      expect(vm.state.canRetry).toBe(false);
      expect(vm.state.errorKey).toBeNull();
    });
  });
});
