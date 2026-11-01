// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildContainer } from './container.ts';
import { getContainer, setContainer } from './context.ts';

// Svelte's context exists only while a component initializes; a Map stands in for it here.
const svelteContext = new Map<unknown, unknown>();
vi.mock('svelte', () => ({
  getContext: (key: unknown) => svelteContext.get(key),
  setContext: (key: unknown, value: unknown) => svelteContext.set(key, value)
}));

describe('container context', () => {
  beforeEach(() => {
    svelteContext.clear();
  });

  it('gives the screens the container the root layout set', () => {
    // Arrange
    const container = buildContainer({ fetch, navigate: () => {} });
    setContainer(container);

    // Act / Assert
    expect(getContainer()).toBe(container);
  });

  it('fails clearly when called outside the root layout', () => {
    // Act / Assert
    expect(() => getContainer()).toThrow('getContainer must be called inside the root layout');
  });
});
