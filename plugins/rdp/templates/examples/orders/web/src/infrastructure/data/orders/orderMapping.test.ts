// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../http/UnexpectedResponseError.ts';
import { toOrder, toOrders } from './orderMapping.ts';

// As the API sends it (camelCase JSON, api/…/Contracts/OrderResponse.cs).
const json = {
  id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  symbol: 'PETR4',
  side: 'sell',
  quantity: 100,
  price: 37.45,
  createdAt: '2026-10-28T12:00:00Z'
};

describe('toOrder', () => {
  it('maps the API order to the read model', () => {
    // Act
    const order = toOrder(json);

    // Assert
    expect(order).toEqual({
      id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      symbol: 'PETR4',
      side: 'sell',
      quantity: 100,
      price: 37.45,
      createdAt: new Date('2026-10-28T12:00:00Z')
    });
  });

  it.each([
    ['an unknown side', { ...json, side: 'short' }],
    ['a missing createdAt', { ...json, createdAt: undefined }],
    ['a price as text', { ...json, price: '37.45' }],
    ['null', null]
  ])('throws on %s', (_, body) => {
    // Act / Assert
    expect(() => toOrder(body)).toThrow(UnexpectedResponseError);
  });
});

describe('toOrders', () => {
  it('maps each order of the list, keeping the order', () => {
    // Act
    const orders = toOrders([json, { ...json, id: 'o-2' }]);

    // Assert
    expect(orders.map((order) => order.id)).toEqual(['3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'o-2']);
  });

  it('throws when the body is not a list', () => {
    // Act / Assert
    expect(() => toOrders(json)).toThrow(UnexpectedResponseError);
  });
});
