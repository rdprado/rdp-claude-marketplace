// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — port to the API's orders, and the read model it speaks (the app's names and
// closed unions, never the API's JSON). The business rules live in the API: `canEdit` and `canCancel`
// come ready from it, the front never decides them.
import type { Result } from '../Result.ts';

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'open' | 'cancelled';

export type Order = {
  readonly id: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly price: number;
  readonly status: OrderStatus;
  readonly canEdit: boolean;
  readonly canCancel: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// clientOrderId: chosen by the front for each order; a resend carries the same one, so the API places it once.
export type NewOrder = {
  readonly clientOrderId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly price: number;
};

export type OrderChanges = {
  readonly quantity: number;
  readonly price: number;
};

export interface OrdersGateway {
  // Newest first, as the API sends them.
  list(): Promise<Result<readonly Order[]>>;
  create(order: NewOrder): Promise<Result<Order>>;
  edit(id: string, changes: OrderChanges): Promise<Result<Order>>;
  cancel(id: string): Promise<Result<Order>>;
}
