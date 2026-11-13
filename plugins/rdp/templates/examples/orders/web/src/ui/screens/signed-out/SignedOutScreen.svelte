<!-- Example code (RDP orders example): a placeholder. Change it or delete it to fit your project. -->
<!-- Layer: UI (Frameworks & Drivers) — View shown after sign-out or a failed sign-in. No state, so no ViewModel. -->
<script lang="ts">
  import { getContainer } from '../../../composition/context.ts';

  const { translator } = getContainer();
  const t = (key: string) => translator.translate(key);
</script>

<div class="signed-out">
  <p>{t('signed-out.title')}</p>
  <a href="/auth/signin" data-sveltekit-reload>{t('signed-out.signin')}</a>
</div>

<style>
  .signed-out {
    display: grid;
    gap: 1rem;
    justify-items: center;
    max-width: 360px;
    margin: 4rem auto;
    padding: 2rem;
    text-align: center;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  a {
    padding: 0.5rem 1rem;
    border-radius: 8px;
    background: var(--primary);
    color: var(--primary-text);
    text-decoration: none;
  }
</style>
