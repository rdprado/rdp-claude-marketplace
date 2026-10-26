---
name: bff
description: "RDP rules for the BFF (backend for frontend): who holds identity and the token, HttpOnly cookie, BFF inside the API vs a separate BFF (SvelteKit / Next.js), proxying. Use when touching sign-in, tokens, cookies, identity provider calls or a BFF, in .NET or TypeScript."
---
# BFF (backend for frontend)

The BFF holds identity and the token, so browser JavaScript never sees it (IETF
`draft-ietf-oauth-browser-based-apps` §6.1; Duende BFF):

- At sign-in the BFF talks to the identity provider and keeps the token in an HttpOnly + Secure +
  SameSite cookie. The front never calls the identity provider.
- On each call the browser sends the cookie; the BFF reads the token from it.

Two valid shapes:

- **If the API only serves this one frontend and doesn't need to be independently deployed or
  versioned, embed it directly in the BFF host as a local API.** The backend API's auth controller
  is the BFF (e.g. `AuthController` in .NET sets the cookie), and the front is a static SPA served
  by it. **At RDP this shape (2-tier) is usually not recommended**; the default is the separate BFF
  below. Use it only after discussing it with the team.
- **If the API is shared by several clients (mobile, MCP, another front) or deployed separately,
  use a separate BFF** (SvelteKit server, Next.js route handlers). It only does sign-in, the cookie,
  refresh, and proxying to the API with `Authorization: Bearer`. No business logic, no use cases,
  no per-feature controllers.
- If the API returns fast-changing data (e.g. market data over SignalR or WebSocket), proxying it
  through the BFF adds latency and load (IETF §6.1.4.3). Consider the API as the BFF (2-tier), so
  the browser reaches that stream with the cookie, without the extra hop; discuss it with the team
  first.

## Separate BFF in TypeScript

A separate BFF has no business logic, but it has auth logic. It follows the same rules as the rest of the code: interface + class, constructor injection, the framework only delivers the request.

### Entry (thin, per framework)

| Framework | Entry |
|---|---|
| SvelteKit | `hooks.server.ts` + `+server.ts` |
| Next.js | `middleware.ts` + `app/api/[...path]/route.ts` |
| Node (Express / Fastify) | middleware + a `/api/*` route |

The entry reads the request, calls one class, and writes the response. No `if` that decides anything.

### Classes (no framework imports)

- `SignIn` — exchanges the code with the identity provider, sets the session cookie.
- `SessionRefresher` — renews the access token when it expires (refresh token rotates).
- `SignOut` — revokes the refresh token at the identity provider, clears the cookies.
- `ApiProxy` — forwards `/api/*` to the API with `Authorization: Bearer`.

Ports: `IdentityProviderClient`, `ApiClient`, `Clock`. Adapters: `HttpIdentityProviderClient`, `FetchApiClient`.
Composition root: one per process, in the entry module (e.g. `hooks.server.ts`), the only `new`.

### What to test

Unit tests, with fakes for the ports:

- **Sign-in:** valid code → cookie set with HttpOnly + Secure + SameSite; invalid code → no cookie.
- **Refresh:**
  - Expired access → renews; new rotated cookie.
  - Failed refresh → cookie cleared, 401.
  - Two concurrent requests → only one renewal.
- **Logout:** revokes at the identity provider and clears the cookies.
- **Proxy:**
  - Adds the Bearer token; drops the `Cookie` header before calling the API.
  - Passes status and body through unchanged.
  - Only `/api/*` gets through.
- **Security:**
  - The token never appears in a response body or header to the browser.
  - A mutating request from another origin is refused (CSRF).

Integration: the real entry against a fake HTTP upstream (identity provider + API).

### Observability

Developers must be able to follow any request from the browser to the API and see auth problems
before users report them. One `401` is normal (sessions expire); the signal is the pattern.

**1. One line per request**, in the entry (`handle` in `hooks.server.ts`), through a `Logger` port,
structured JSON to stdout:

```json
{ "event": "request", "method": "GET", "route": "/api/trainees/:email",
  "status": 200, "durationMs": 84, "upstreamMs": 71, "traceId": "…", "userId": "…" }
```

- `route` is the template, never the real path: paths can carry emails or ids.
- `upstreamMs` = time spent in the API, so "BFF slow" and "API slow" are told apart.

**2. Auth events**, logged by the classes that own them:

| Event | Level |
|---|---|
| `signin.ok` / `signin.failed` (reason: `invalid_code`, `expired`, `idp_down`) | Info / Warning |
| `refresh.ok` / `refresh.failed` (reason: `expired`, `revoked`) | Info / Warning |
| `refresh.reused` — a rotated refresh token used twice: possible theft | Error |
| `signout` (and whether the revoke worked) | Info |
| `csrf.rejected` | Warning |

**3. Failures:** `proxy.failed` (API down or timeout, with `upstreamMs`), `idp.unavailable`
(identity provider down), and any unexpected exception in the framework's error hook
(`handleError` in SvelteKit) with its stack. All Error.

**4. Tracing:** the BFF reads the W3C `traceparent` header (or creates one when the browser sent
none), forwards it to the API, and every line carries its `traceId`. Use `traceparent`, not a
custom header: Sentry, Datadog, Grafana and .NET (`Activity`) already propagate it.

**5. Alerts** on rates, never on single events: `signin.failed` and `refresh.failed` above normal,
any `refresh.reused`, `proxy.failed`, `idp.unavailable`.

**Never logged:** tokens, cookies, sign-in codes, emails or other personal data, request and
response bodies.

**In the front:** the shared HTTP adapter adds a breadcrumb per request (route, status, duration)
and the ViewModel's `catch` reports unexpected failures. A breadcrumb travels only with a later
error, so rate alerts come from the BFF logs, not the front. Validation and not-found results are not
logged: the user already sees them.

**BFF inside the API (2-tier):** the same events and fields, logged by the API (.NET structured
logging); the BFF and API lines are one log.

**Tests:** the classes log through the `Logger` port, so a test checks the event and that no token or
email is in it (e.g. `refresh.reused` logs Error without the token).

## The front

The front is the same in both shapes:

```
View (page) → TraineesViewModel → TraineesClient (interface) → HttpTraineesClient → /api/...
              TraineesViewModel → TraineeFormValidator.validate (warning only)
```

- The front is MVVM (see `rdp:clean-architecture-typescript` → "Presentation: MVVM"): the
  ViewModel calls the client interface; no front use case when the logic is in the API.
- Field validators in the browser only warn before sending. The API validates for real, and both
  sides use the same test cases.
- If logic shows up in a separate BFF, it moves to a use case in the API.

