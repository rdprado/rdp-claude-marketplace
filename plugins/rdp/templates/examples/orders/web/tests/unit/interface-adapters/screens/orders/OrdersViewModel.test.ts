// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it, vi } from 'vitest';
import type { IdGenerator } from '#application/ports/IdGenerator.ts';
import type { Monitoring } from '#application/ports/Monitoring.ts';
import type { Order, OrdersGateway } from '#application/ports/OrdersGateway.ts';
import { SessionExpiredError } from '#application/ports/Session.ts';
import type { Toaster } from '#application/ports/Toaster.ts';
import { Result } from '#application/Result.ts';
import { OrdersViewModel } from '#interface-adapters/screens/orders/OrdersViewModel.ts';

const CREATED = new Date('2026-10-28T12:00:00Z');

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o-1',
    symbol: 'PETR4',
    side: 'buy',
    quantity: 1000,
    price: 37.5,
    createdAt: CREATED,
    ...overrides
  };
}

// Every method fails loudly unless the test sets it.
function gateway(overrides: Partial<OrdersGateway> = {}): OrdersGateway {
  const unexpected = () => Promise.reject(new Error('not expected in this test'));
  return { list: unexpected, create: unexpected, ...overrides };
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
        order({ id: 'o-2', symbol: 'VALE3', side: 'sell', quantity: 200, price: 61.2 }),
        order({ id: 'o-1' })
      ]);

      // Assert
      expect(vm.state.rows).toEqual([
        {
          id: 'o-2',
          symbol: 'VALE3',
          sideKey: 'orders.side.sell',
          quantityText: '200',
          priceText: '61,20'
        },
        {
          id: 'o-1',
          symbol: 'PETR4',
          sideKey: 'orders.side.buy',
          quantityText: '1.000',
          priceText: '37,50'
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

    it('shows the unexpected message without the retry button when the request fails', async () => {
      // Arrange
      const create = () => Promise.reject(new Error('network down'));
      const { vm } = await loadedWith([], { create });

      // Act
      await vm.create();

      // Assert
      expect(vm.state.errorKey).toBe('errors.unexpected');
      expect(vm.state.canRetry).toBe(false);
    });

    it('takes back the offer to reload the list when it starts', async () => {
      // Arrange
      const { toaster, monitoring, ids } = ports();
      const vm = new OrdersViewModel(
        gateway({
          list: () => Promise.reject(new Error('network down')),
          create: () => Promise.resolve(Result.success(order()))
        }),
        toaster,
        monitoring,
        ids
      );
      await vm.load();

      // Act
      await vm.create();

      // Assert
      expect(vm.state.canRetry).toBe(false);
      expect(vm.state.errorKey).toBeNull();
    });

    it('is busy while the request runs', async () => {
      // Arrange
      let busyDuringCall: boolean | null = null;
      const { toaster, monitoring, ids } = ports();
      const vm: OrdersViewModel = new OrdersViewModel(
        gateway({
          create: () => {
            busyDuringCall = vm.state.busy;
            return Promise.resolve(Result.success(order()));
          }
        }),
        toaster,
        monitoring,
        ids
      );

      // Act
      await vm.create();

      // Assert
      expect(busyDuringCall).toBe(true);
      expect(vm.state.busy).toBe(false);
    });
  });
});
