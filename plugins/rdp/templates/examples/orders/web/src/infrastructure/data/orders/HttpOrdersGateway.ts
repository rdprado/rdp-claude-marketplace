// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — adapter of the OrdersGateway port: the API's /api/v1/orders through the BFF.
import type {
  NewOrder,
  Order,
  OrderChanges,
  OrdersGateway
} from '../../../application/ports/OrdersGateway.ts';
import type { Result } from '../../../application/Result.ts';
import type { BffHttpClient } from '../http/BffHttpClient.ts';
import { toResult } from '../http/toResult.ts';
import { toOrder, toOrders } from './orderMapping.ts';

const ORDERS = '/api/v1/orders';

export class HttpOrdersGateway implements OrdersGateway {
  constructor(private readonly http: BffHttpClient) {}

  async list(): Promise<Result<readonly Order[]>> {
    const reply = await this.http.send({ method: 'GET', path: ORDERS, route: ORDERS });
    return toResult(reply.status, reply.body, toOrders);
  }

  // The app's types go out as the body while their fields match the API's; when they differ, add a
  // mapping next to toOrder instead of changing the app's types.
  async create(order: NewOrder): Promise<Result<Order>> {
    const reply = await this.http.send({ method: 'POST', path: ORDERS, route: ORDERS, body: order });
    return toResult(reply.status, reply.body, toOrder);
  }

  async edit(id: string, changes: OrderChanges): Promise<Result<Order>> {
    const reply = await this.http.send({
      method: 'PUT',
      path: `${ORDERS}/${encodeURIComponent(id)}`,
      route: `${ORDERS}/:id`,
      body: changes
    });
    return toResult(reply.status, reply.body, toOrder);
  }

  async cancel(id: string): Promise<Result<Order>> {
    const reply = await this.http.send({
      method: 'POST',
      path: `${ORDERS}/${encodeURIComponent(id)}/cancel`,
      route: `${ORDERS}/:id/cancel`
    });
    return toResult(reply.status, reply.body, toOrder);
  }
}
