<!-- Example code (RDP orders example): a placeholder. Change it or delete it to fit your project. -->
<!-- Layer: Interface Adapters — View of the orders screen. Humble: binds to OrdersViewModel, translates
     its keys and calls its methods; every decision is already in $vm.
     Actions are called through the instance (`() => vm.retry()`); passed loose (`vm.retry`), a method
     loses `this`. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getContainer } from '../../../composition/context.ts';

  const { ordersViewModel, translator } = getContainer();
  const vm = ordersViewModel();
  const t = (key: string) => translator.translate(key);
  vm.load();
  onDestroy(() => vm.dispose());
</script>

<section class="orders">
  <form
    class="new-order"
    onsubmit={(event) => {
      event.preventDefault();
      vm.create();
    }}
  >
    <h2>{t('orders.new')}</h2>
    <label>
      {t('orders.symbol')}
      <input value={$vm.draft.symbol} oninput={(e) => vm.changeDraft({ symbol: e.currentTarget.value })} />
      {#if $vm.draftErrors.symbol}<small role="alert">{t($vm.draftErrors.symbol)}</small>{/if}
    </label>
    <label>
      {t('orders.side')}
      <select value={$vm.draft.side} onchange={(e) => vm.chooseSide(e.currentTarget.value)}>
        {#each vm.sideOptions as option (option.value)}
          <option value={option.value}>{t(option.labelKey)}</option>
        {/each}
      </select>
      {#if $vm.draftErrors.side}<small role="alert">{t($vm.draftErrors.side)}</small>{/if}
    </label>
    <label>
      {t('orders.quantity')}
      <input
        type="number"
        value={$vm.draft.quantity}
        oninput={(e) => vm.changeDraft({ quantity: e.currentTarget.value })}
      />
      {#if $vm.draftErrors.quantity}<small role="alert">{t($vm.draftErrors.quantity)}</small>{/if}
    </label>
    <label>
      {t('orders.price')}
      <input
        type="number"
        step="any"
        value={$vm.draft.price}
        oninput={(e) => vm.changeDraft({ price: e.currentTarget.value })}
      />
      {#if $vm.draftErrors.price}<small role="alert">{t($vm.draftErrors.price)}</small>{/if}
    </label>
    <button type="submit" class="primary" disabled={$vm.busy}>{t('orders.create')}</button>
  </form>

  {#if $vm.errorKey}
    <p class="banner" role="alert">
      {t($vm.errorKey)}
      {#if $vm.canRetry}<button type="button" onclick={() => vm.retry()}>{t('orders.retry')}</button>{/if}
    </p>
  {/if}

  {#if $vm.loading}<p>{t('orders.loading')}</p>{/if}
  {#if $vm.emptyKey}<p>{t($vm.emptyKey)}</p>{/if}

  <div class="table-card">
    <table>
      <thead>
        <tr>
          <th>{t('orders.symbol')}</th>
          <th>{t('orders.side')}</th>
          <th class="num">{t('orders.quantity')}</th>
          <th class="num">{t('orders.price')}</th>
          <th>{t('orders.status')}</th>
          <th class="actions"></th>
        </tr>
      </thead>
      <tbody>
        {#each $vm.rows as row (row.id)}
          <tr>
            <td class="symbol">{row.symbol}</td>
            <td><span class="side" data-side={row.sideKey}>{t(row.sideKey)}</span></td>
            {#if row.edit}
              <td class="num">
                <input
                  type="number"
                  aria-label={t('orders.quantity')}
                  value={row.edit.quantity}
                  oninput={(e) => vm.changeEdit({ quantity: e.currentTarget.value })}
                />
                {#if $vm.editErrors.quantity}<small role="alert">{t($vm.editErrors.quantity)}</small>{/if}
              </td>
              <td class="num">
                <input
                  type="number"
                  step="any"
                  aria-label={t('orders.price')}
                  value={row.edit.price}
                  oninput={(e) => vm.changeEdit({ price: e.currentTarget.value })}
                />
                {#if $vm.editErrors.price}<small role="alert">{t($vm.editErrors.price)}</small>{/if}
              </td>
              <td><span class="status" data-status={row.statusKey}>{t(row.statusKey)}</span></td>
              <td class="actions">
                <button type="button" class="primary" disabled={$vm.busy} onclick={() => vm.saveEdit()}
                  >{t('orders.save')}</button
                >
                <button type="button" onclick={() => vm.stopEdit()}>{t('orders.discard')}</button>
              </td>
            {:else}
              <td class="num">{row.quantityText}</td>
              <td class="num">{row.priceText}</td>
              <td><span class="status" data-status={row.statusKey}>{t(row.statusKey)}</span></td>
              <td class="actions">
                {#if row.canEdit}
                  <button type="button" disabled={$vm.busy} onclick={() => vm.startEdit(row.id)}
                    >{t('orders.edit')}</button
                  >
                {/if}
                {#if row.canCancel}
                  <button
                    type="button"
                    class="danger"
                    disabled={$vm.busy}
                    onclick={() => vm.cancelOrder(row.id)}
                  >
                    {t('orders.cancel')}
                  </button>
                {/if}
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .orders {
    display: grid;
    gap: 1.25rem;
  }
  .new-order,
  .table-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .new-order {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.9rem;
    align-items: start;
    padding: 1.25rem;
  }
  .new-order h2 {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 1rem;
  }
  .new-order button {
    align-self: end;
    margin-top: 1.35rem;
  }
  label {
    display: grid;
    gap: 0.3rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  input,
  select {
    font: inherit;
    color: var(--text);
    background: var(--surface);
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  td input {
    width: 7rem;
    text-align: right;
  }
  small[role='alert'] {
    color: var(--danger);
    font-size: 0.78rem;
  }
  .primary {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--primary-text);
  }
  .danger {
    color: var(--danger);
  }
  .danger:hover:not(:disabled) {
    border-color: var(--danger);
  }
  .banner {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    margin: 0;
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--danger) 10%, var(--surface));
  }
  .orders > p {
    margin: 0;
    color: var(--muted);
  }
  .table-card {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    padding: 0.7rem 1rem;
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: middle;
  }
  th {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  tbody tr:hover {
    background: color-mix(in srgb, var(--primary) 4%, transparent);
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .symbol {
    font-weight: 600;
  }
  .side[data-side$='buy'] {
    color: var(--buy);
  }
  .side[data-side$='sell'] {
    color: var(--sell);
  }
  .status {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.78rem;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
  }
  .status[data-status$='cancelled'] {
    background: color-mix(in srgb, var(--muted) 15%, transparent);
    color: var(--muted);
  }
  .actions {
    text-align: right;
    white-space: nowrap;
  }
  .actions button + button {
    margin-left: 0.4rem;
  }
</style>
