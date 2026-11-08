Stack: TypeScript + SvelteKit (front + BFF) and .NET <version> + ASP.NET Core Web API

## Template: Svelte + BFF + ASP.NET Core back end

- `web/`: front and BFF, as in the Svelte + BFF template — MVVM front as in
  the orders example's `web/`, SvelteKit server as the BFF per `bff` (tokens on the server, a session
  id in an HttpOnly cookie, proxies `/api/*`, no business logic).
- `api/`: the back end, per `rdp-mode` — all business rules live here. It trusts the
  Bearer token the BFF forwards.
- The W3C `traceparent` goes from the BFF to the API, so one request can be followed end to end.
- Tests: Vitest in `web/`, xUnit in `api/`.

## Layout

```
web/                                         SvelteKit: front (MVVM) + BFF
  src/application/  src/infrastructure/   front: ports, Result; gateways, clock, i18n
  src/interface-adapters/screens/<feature>/  XViewModel.ts, XScreen.svelte, tests
  src/composition/                           container + context (front)
  src/routes/                                +page.svelte only renders a screen
  src/lib/server/bff/                        auth.ts, api.ts, observability.ts (modules, no ports)
  src/hooks.server.ts                        BFF entry + its composition root
api/                                         ASP.NET Core, per rdp-mode
  src/<App>.Entities
  src/<App>.Application                      use cases, ports, validators, OutputStatus, ValidationResult
  src/<App>.Infrastructure.<X>               one project per concern
  src/<App>.Api                              controllers, Program.cs (composition root)
  tests/<App>.Tests.Unit
  tests/<App>.Tests.Integration              Narrow/, Broad/, Infrastructure/ (test host, fakes)
```

Build:
```
cd web && npm run build && npm run check && npx vitest run
cd api && dotnet build && dotnet test
```
