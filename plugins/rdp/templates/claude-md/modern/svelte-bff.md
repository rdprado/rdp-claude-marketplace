Stack: TypeScript + SvelteKit (front + separate BFF)

## Template: Svelte + BFF

- Front: MVVM per the `clean-architecture-typescript` skill — a `ViewModel<S>` per screen, humble
  `.svelte` views, factories in the composition root, `dispose()` on unmount.
- BFF: the SvelteKit server, per the `bff` skill — it holds the token in an HttpOnly cookie and
  proxies `/api/*` to the API. No business logic in it. The browser never sees a token.
- Tests: Vitest for ViewModels, validators, mappers and the BFF classes, per `testing-typescript`.

## Layout

```
src/entities/  src/application/  src/infrastructure/   front, per clean-architecture-typescript
src/interface-adapters/screens/<feature>/              XViewModel.ts, XScreen.svelte, tests
src/composition/                                       container + context (front)
src/routes/                                            +page.svelte only renders a screen
src/lib/server/bff/                                    SignIn, SessionRefresher, SignOut, ApiProxy, ports, PinoLogger
src/hooks.server.ts                                    BFF entry + its composition root
```

Build:
```
npm run build
npm run check
npx vitest run
```
