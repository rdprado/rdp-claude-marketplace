// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Interface Adapters — store shared across screens (the Svelte counterpart of a Zustand store):
// the toasts on display. It implements the Toaster port that ViewModels receive, and reuses the
// ViewModel base only for the store contract. One instance per app, held by the container.
import type { Toaster } from '../../application/ports/Toaster.ts';
import { ViewModel } from '../view-models/ViewModel.ts';

export type Toast = {
  readonly id: number;
  readonly messageKey: string;
};

export type ToastsState = {
  readonly toasts: readonly Toast[];
};

export class ToastStore extends ViewModel<ToastsState> implements Toaster {
  private nextId = 1;

  constructor() {
    super({ toasts: [] });
  }

  show(messageKey: string): void {
    this.set({ toasts: [...this.state.toasts, { id: this.nextId++, messageKey }] });
  }

  dismiss(id: number): void {
    this.set({ toasts: this.state.toasts.filter((toast) => toast.id !== id) });
  }
}
