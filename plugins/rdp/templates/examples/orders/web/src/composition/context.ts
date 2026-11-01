// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Composition root — delivers the container to the Views through Svelte's context. Both functions
// must run while a component initializes (the root layout sets it, screens get it).
import { getContext, setContext } from 'svelte';
import type { Container } from './container.ts';

const KEY = Symbol('container');

export function setContainer(container: Container): void {
  setContext(KEY, container);
}

export function getContainer(): Container {
  const container = getContext<Container | undefined>(KEY);
  if (!container) throw new Error('getContainer must be called inside the root layout');
  return container;
}
