<!-- Example code (RDP orders example): a placeholder. Change it or delete it to fit your project. -->
<!-- Layer: UI (Frameworks & Drivers) — entry: builds the container once and delivers it; renders the page,
     the toasts and the sign-out form (a plain POST, checked by the BFF's CSRF guard). -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { buildContainer } from '#composition/container.ts';
  import { setContainer } from '#composition/context.ts';
  import Toasts from '#ui/components/Toasts.svelte';

  const { children }: { children: Snippet } = $props();
  const container = buildContainer({
    fetch: (input, init) => fetch(input, init),
    navigate: (url) => window.location.assign(url)
  });
  setContainer(container);
  const t = (key: string) => container.translator.translate(key);
</script>

<header>
  <h1>{t('app.title')}</h1>
  <form method="post" action="/auth/signout">
    <button type="submit" class="ghost">{t('app.signout')}</button>
  </form>
</header>
<main>
  {@render children()}
</main>
<Toasts />

<style>
  :global(:root) {
    --bg: #f4f6fa;
    --surface: #ffffff;
    --text: #1d2433;
    --muted: #667085;
    --border: #e3e7ef;
    --primary: #2563eb;
    --primary-text: #ffffff;
    --danger: #dc2626;
    --buy: #15803d;
    --sell: #b91c1c;
    --radius: 10px;
    --shadow: 0 1px 2px rgb(16 24 40 / 6%), 0 1px 3px rgb(16 24 40 / 10%);
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --bg: #0f141c;
      --surface: #171e29;
      --text: #e6e9ef;
      --muted: #98a2b3;
      --border: #2a3342;
      --primary: #3b82f6;
      --buy: #4ade80;
      --sell: #f87171;
    }
  }
  :global(body) {
    margin: 0;
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
      sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  :global(button) {
    font: inherit;
    padding: 0.45rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }
  :global(button:hover:not(:disabled)) {
    border-color: var(--primary);
  }
  :global(button:disabled) {
    opacity: 0.55;
    cursor: not-allowed;
  }
  :global(button:focus-visible),
  :global(input:focus-visible),
  :global(select:focus-visible) {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.5rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  h1 {
    margin: 0;
    font-size: 1.15rem;
  }
  .ghost {
    border-color: transparent;
    color: var(--muted);
  }
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem;
  }
</style>
