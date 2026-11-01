// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — the API's order JSON → the app's Order read model, parsed once where it comes
// in. The API's JSON type stays private to this file.
// JSON enters as `unknown` and is checked field by field here; never `any` or `as Order`.
import type { Order, OrderSide, OrderStatus } from '../../../application/ports/OrdersGateway.ts';
import { isObject } from '../../../application/isObject.ts';
import { UnexpectedResponseError } from '../http/UnexpectedResponseError.ts';

type OrderJson = {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
  canEdit: boolean;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
};

const SIDES: readonly OrderSide[] = ['buy', 'sell'];
const STATUSES: readonly OrderStatus[] = ['open', 'cancelled'];

export function toOrders(json: unknown): readonly Order[] {
  if (!Array.isArray(json)) throw malformed('a list of orders');
  return json.map(toOrder);
}

export function toOrder(json: unknown): Order {
  if (!isOrderJson(json)) throw malformed('an order');
  const side = SIDES.find((s) => s === json.side);
  const status = STATUSES.find((s) => s === json.status);
  if (!side || !status) throw malformed(`an order with side "${json.side}" and status "${json.status}"`);
  return {
    id: json.id,
    symbol: json.symbol,
    side,
    quantity: json.quantity,
    price: json.price,
    status,
    canEdit: json.canEdit,
    canCancel: json.canCancel,
    createdAt: new Date(json.createdAt),
    updatedAt: new Date(json.updatedAt)
  };
}

// The JSON type of each field; `satisfies` makes the build fail when OrderJson gets a field this misses.
const ORDER_JSON_FIELDS = {
  id: 'string',
  symbol: 'string',
  side: 'string',
  quantity: 'number',
  price: 'number',
  status: 'string',
  canEdit: 'boolean',
  canCancel: 'boolean',
  createdAt: 'string',
  updatedAt: 'string'
} as const satisfies Record<keyof OrderJson, 'string' | 'number' | 'boolean'>;

function isOrderJson(json: unknown): json is OrderJson {
  return (
    isObject(json) && Object.entries(ORDER_JSON_FIELDS).every(([field, type]) => typeof json[field] === type)
  );
}

function malformed(expected: string): UnexpectedResponseError {
  return new UnexpectedResponseError(200, `expected ${expected}`);
}
