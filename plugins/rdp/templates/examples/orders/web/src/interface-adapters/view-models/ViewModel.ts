// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Interface Adapters — base class of every ViewModel: one immutable state snapshot and the
// notification plumbing. Satisfies Svelte's store contract (`$vm`) and React's useSyncExternalStore.
// MVVM (Fowler's Presentation Model): the View binds to this state and calls its methods; it decides nothing.
// Plain TS: no runes ($state, $derived, .svelte.ts) or hooks in a ViewModel, so it runs in tests without
// the framework.
export abstract class ViewModel<S> {
  private readonly listeners = new Set<(state: S) => void>();
  private readonly cleanups: (() => void)[] = [];

  constructor(private current: S) {}

  get state(): S {
    return this.current;
  }

  getSnapshot = (): S => this.current;

  subscribe = (listener: (state: S) => void): (() => void) => {
    this.listeners.add(listener);
    listener(this.current); // Svelte's store contract needs the immediate call
    return () => this.listeners.delete(listener);
  };

  // Stops what this ViewModel started (streams, timers, subscriptions). Leaves it reusable:
  // React's StrictMode, in development, runs the cleanup and then the effect again on the same instance.
  dispose(): void {
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
  }

  protected set(next: S): void {
    this.current = next;
    this.listeners.forEach((listener) => listener(next));
  }

  // Register how to stop something this ViewModel started, e.g. a stream's unsubscribe.
  protected track(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }
}
