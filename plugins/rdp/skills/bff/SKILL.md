---
name: bff
description: "RDP rules for the BFF (backend for frontend): who holds identity and the token, HttpOnly cookie, BFF inside the API vs a separate BFF (SvelteKit / Next.js), proxying. Use when touching sign-in, tokens, cookies, identity provider calls or a BFF, in .NET or TypeScript."
---
# BFF (backend for frontend)

The BFF holds identity and the token, so browser JavaScript never sees it (IETF
`draft-ietf-oauth-browser-based-apps` §6.1; Duende BFF):

- At sign-in the BFF talks to the identity provider and keeps the token in an HttpOnly + Secure +
  SameSite cookie. The front never calls the identity provider.
- The cookie is encrypted (AES-256-GCM, key from a `SESSION_SECRET` env var; or an opaque session id
  with the tokens kept on the server). Never the token in plain text or base64: DevTools would show it.
  A tampered cookie counts as no session.
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
- `SessionRefresher` — renews the access token when it expires (refresh token rotates). Requests that
  arrive together share one renewal; the old cookie is accepted for a few seconds at most (concurrent
  requests), never longer, or a stolen copy replayed in that window isn't caught as reuse.
- `SignOut` — revokes the refresh token at the identity provider, clears the cookies.
- `ApiProxy` — forwards `/api/*` to the API with `Authorization: Bearer`.

Errors: the API's error body (`{ "error": { "code" } }`) passes through unchanged. The BFF's own
errors use the same shape with its own codes (`session-expired`, `api-unavailable`), never an
exception or a stack.

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

**Logger and where the logs go:**

The logging library is **pino**. RDP hasn't chosen the observability tool (where logs and errors
end up) yet: pick it per project, with the team; the tool names below are examples.

- Classes log through a `Logger` port (`application/ports/Logger.ts`); the adapter is
  `PinoLogger` over pino, with `redact` on `token`, `cookie`, `authorization`, `code` as a safety
  net. Not `console.*` in production: no levels, no redaction.
- pino writes JSON lines to **stdout**, never to a file. The host collects them (e.g.
  journald under systemd, `docker logs` in a container) and an agent ships them to whatever log
  tool the project uses. The app knows nothing of the destination, so changing the tool touches no
  code.
- Unexpected errors also go to the project's monitoring tool through the `Monitoring` port, with
  the stack.
- .NET (BFF inside the API): `ILogger<T>` is already the port, with Serilog behind it
  (`clean-architecture` skill → Logging); same stdout path.

```ts
// application/ports/Logger.ts
export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}
```

**1. One line per request**, in the entry (`handle` in `hooks.server.ts`), through a `Logger` port,
structured JSON to stdout:

```json
{ "event": "request", "method": "GET", "route": "/api/trainees/:email",
  "status": 200, "durationMs": 84, "upstreamMs": 71, "traceId": "…", "userId": "…" }
```

- `route` is the template, never the real path: paths can carry emails or ids.
- `upstreamMs` = time spent in the API, so "BFF slow" and "API slow" are told apart.
- `userId` is the opaque id from the token (`sub`), never an email or name.

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
custom header: it's the W3C standard, and .NET (`Activity`) and the common monitoring tools already
propagate it.

**5. Alerts** on rates, never on single events: `signin.failed` and `refresh.failed` above normal,
any `refresh.reused`, `proxy.failed`, `idp.unavailable`.

**Never logged:** tokens, cookies, sign-in codes, emails or other personal data, request and
response bodies.

**In the front:** the shared HTTP adapter records each request (route, status, duration) as context
for the `Monitoring` port (a "breadcrumb" in Sentry's terms), and the ViewModel's `catch` reports
unexpected failures. That context travels only with a later error, so rate alerts come from the BFF
logs, not the front. Validation and not-found results are not
logged: the user already sees them.

**BFF inside the API (2-tier):** the same events and fields, logged by the API (.NET structured
logging); the BFF and API lines are one log.

**Tests:** the classes log through the `Logger` port, so a test checks the event and that no token or
email is in it (e.g. `refresh.reused` logs Error without the token).

## The front

The front is the same in both shapes:

```
View (page) → TraineesViewModel → TraineesGateway (interface) → HttpTraineesGateway → /api/...
              TraineesViewModel → TraineeFormValidator.validate (warning only)
```

- The front is MVVM (see `rdp:clean-architecture-typescript` → "Presentation: MVVM"): the
  ViewModel calls the gateway interface; no front use case when the logic is in the API.
- Field validators in the browser only warn before sending. The API validates for real, and both
  sides use the same test cases.
- If logic shows up in a separate BFF, it moves to a use case in the API.

