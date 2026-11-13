// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it, vi } from 'vitest';
import { ViewModel } from '#interface-adapters/view-models/ViewModel.ts';

class CounterViewModel extends ViewModel<{ readonly count: number }> {
  constructor() {
    super({ count: 0 });
  }

  increment(): void {
    this.set({ count: this.state.count + 1 });
  }

  startTimer(stop: () => void): void {
    this.track(stop);
  }
}

describe('ViewModel', () => {
  it('calls a new listener at once, then on every change until it unsubscribes', () => {
    // Arrange
    const vm = new CounterViewModel();
    const listener = vi.fn();
    const unsubscribe = vm.subscribe(listener);

    // Act
    vm.increment();
    unsubscribe();
    vm.increment();

    // Assert
    expect(listener.mock.calls).toEqual([[{ count: 0 }], [{ count: 1 }]]);
    expect(vm.getSnapshot()).toEqual({ count: 2 });
  });

  it('runs each tracked cleanup once on dispose', () => {
    // Arrange
    const vm = new CounterViewModel();
    const stop = vi.fn();
    vm.startTimer(stop);

    // Act
    vm.dispose();
    vm.dispose();

    // Assert
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
