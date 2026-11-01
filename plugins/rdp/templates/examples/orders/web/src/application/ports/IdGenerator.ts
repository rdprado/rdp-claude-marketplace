// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — port: new unique ids (an order's client order id), so they're fixed in tests.
export interface IdGenerator {
  newId(): string;
}
