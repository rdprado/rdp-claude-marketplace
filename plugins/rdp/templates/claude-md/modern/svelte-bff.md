Stack: TypeScript + SvelteKit (front + separate BFF)

## Template: Svelte + BFF

- Front: MVVM as in the orders example's `web/` — a `ViewModel<S>` per screen, humble
  `.svelte` views, factories in the composition root, `dispose()` on unmount.
- BFF: the SvelteKit server, per the `bff` skill — it keeps the tokens on the server (the HttpOnly
  cookie carries only a session id) and proxies `/api/*` to the API. No business logic in it. The
  browser never sees a token.
- Tests: Vitest for ViewModels, validators, mappers and the BFF modules.

## Layout

```
src/application/  src/infrastructure/                 front: ports, Result; gateways, clock, i18n
src/interface-adapters/screens/<feature>/              XViewModel.ts (no .svelte here)
src/interface-adapters/field-formats/                  format checks of reusable fields (quantityFormat.ts...)
src/ui/screens/<feature>/  src/ui/fields/  src/ui/shell/   the .svelte views (Frameworks & Drivers), humble
src/composition/                                       container + context (front)
src/routes/                                            +page.svelte only renders a view from #ui/
src/lib/server/bff/                                    auth.ts, api.ts, observability.ts (modules, no ports)
src/hooks.server.ts                                    BFF entry + its composition root
tests/unit/<same path as src>/X.test.ts                never next to the code
tests/integration/narrow/  tests/integration/broad/    tests/support/ (shared fakes, fake HTTP server)
```

Build:
```
npm run build
npm run check
npx vitest run
```
