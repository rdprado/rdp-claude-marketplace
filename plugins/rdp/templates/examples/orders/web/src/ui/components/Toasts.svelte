<!-- Example code (RDP orders example): a placeholder. Change it or delete it to fit your project. -->
<!-- Layer: UI (Frameworks & Drivers) — View of the toasts shared by every screen (ToastStore). -->
<script lang="ts">
  import { getContainer } from '../../composition/context.ts';

  const { toasts, translator } = getContainer();
  const t = (key: string) => translator.translate(key);
</script>

<ul class="toasts" aria-live="polite">
  {#each $toasts.toasts as toast (toast.id)}
    <li>
      {t(toast.messageKey)}
      <button type="button" onclick={() => toasts.dismiss(toast.id)}>{t('feedback.dismiss')}</button>
    </li>
  {/each}
</ul>

<style>
  .toasts {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.6rem 0.9rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid var(--buy);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
</style>
