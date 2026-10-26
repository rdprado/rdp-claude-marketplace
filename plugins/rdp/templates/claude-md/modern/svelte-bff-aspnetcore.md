Stack: TypeScript + SvelteKit (front + BFF) and .NET <version> + ASP.NET Core Web API

## Template: Svelte + BFF + ASP.NET Core back end

- `web/`: front and BFF, as in the Svelte + BFF template — MVVM front per
  `clean-architecture-typescript`, SvelteKit server as the BFF per `bff` (token in an HttpOnly
  cookie, proxies `/api/*`, no business logic).
- `api/`: the back end, per `clean-architecture` — all business rules live here. It trusts the
  Bearer token the BFF forwards.
- The W3C `traceparent` goes from the BFF to the API, so one request can be followed end to end.
- Tests: Vitest in `web/` (`testing-typescript`), xUnit in `api/` (`testing`).

## Layout

```
web/                                   SvelteKit: front (MVVM) + BFF, see the Svelte + BFF layout
  src/interface-adapters/screens/<feature>/
  src/lib/server/bff/
  src/hooks.server.ts
api/                                   ASP.NET Core, see the back-end layout
  src/<App>.Entities  src/<App>.Application  src/<App>.Infrastructure.<X>  src/<App>.Api
  tests/<App>.Tests.Unit  tests/<App>.Tests.Integration
```

Build:
```
cd web && npm run build && npm run check && npx vitest run
cd api && dotnet build && dotnet test
```
