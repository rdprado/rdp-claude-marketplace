// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { ToastStore } from './ToastStore.ts';

describe('ToastStore', () => {
  it('shows toasts in order and removes only the dismissed one', () => {
    // Arrange
    const store = new ToastStore();
    store.show('feedback.order-created');
    store.show('feedback.order-created');

    // Act
    store.dismiss(1);

    // Assert
    expect(store.state.toasts).toEqual([{ id: 2, messageKey: 'feedback.order-created' }]);
  });
});
