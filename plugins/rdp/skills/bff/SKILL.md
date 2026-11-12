---
name: bff
description: "RDP rules for the BFF (backend for frontend): who holds identity and the token, HttpOnly cookie, BFF inside the API vs a separate BFF (SvelteKit / Next.js), proxying. Use when touching sign-in, tokens, cookies, identity provider calls or a BFF, in .NET or TypeScript."
---
# BFF (backend for frontend)

The BFF holds identity and the token, so browser JavaScript never sees it (IETF
`draft-ietf-oauth-browser-based-apps` §6.1; Duende BFF):

- At sign-in the BFF talks to the identity provider and keeps the tokens **on the server**. The
  front never calls the identity provider.
- **The cookie never carries a token: not the access, refresh or id token, not even encrypted or
  signed.** It carries only a random session id (HttpOnly + Secure + SameSite). An unknown id
  counts as no session.
- On each call the browser sends the cookie; the BFF looks the tokens up by the id.
- Tokens live in the BFF's memory: a restart (each deploy) signs everyone out, and the BFF runs as
  one instance.

The identity provider is kr-identity (orders example: `auth.ts`, `appSettings.ts`):

- Config `IdentityProvider`: `Authority`, `ClientId`, `Scope` (`openid offline_access` + the API's),
  `RedirectUri`, `ClientIpHeader`. Ask for the addresses, the client id and the scope.
- Endpoints: `{Authority}/authorize`, `/oauth/token`, `/oauth/revoke`.
- Confidential client in HML/PRD: the secret only from the environment (`IdentityProvider__ClientSecret`),
  sent as the form field `client_secret`, never in a committed file. Locally a public client against the
  API's dev identity provider, which answers on the same paths.
- A refresh answered 400 ends the session; any other error (401 `invalid_client`, 429, 5xx) keeps it
  (503): it's the BFF's or the provider's problem, not the user's.

Two valid shapes:

- **If the API only serves this one frontend and doesn't need to be independently deployed or
  versioned, embed it directly in the BFF host as a local API.** The backend API's auth controller
  is the BFF (e.g. `AuthController` in .NET sets the cookie), and the front is a static SPA served
  by it. **At RDP this shape (2-tier) is usually not recommended**; the default is the separate BFF
  below. Use it only after discussing it with the team.
- **If the API is shared by several clients (mobile, MCP, another front) or deployed separately,
  use a separate BFF** (SvelteKit server, Next.js route handlers). It only does sign-in, the cookie,
  refresh, and proxying to the API with `Authorization: Bearer`. No business logic, no use cases,
  no per-feature controllers, no validation or limits either: the services behind it own them;
  the BFF keeps the cookie and the tokens and forwards.
- If the API returns fast-changing data (e.g. market data over SignalR or WebSocket), proxying it
  through the BFF adds latency and load (IETF §6.1.4.3). Consider the API as the BFF (2-tier), so
  the browser reaches that stream with the cookie, without the extra hop; discuss it with the team
  first.

## Separate BFF in TypeScript

A separate BFF is infrastructure: it keeps the cookie and the tokens and forwards. **No use cases,
no ports, no adapter files, no interface + class pairs.** One module per subject, plus the entry:

- `auth`: sign-in (PKCE), the session store, refresh, sign-out, the CSRF check.
- One proxy module per upstream (e.g. `api`; `marketData`, `history` when the project has them).

Testable without ports: each module takes what touches the outside world (`fetch`, the clock, the
logger) as parameters, and the test passes plain fake functions.

### Entry (thin, per framework)

| Framework | Entry |
|---|---|
| SvelteKit | `hooks.server.ts` + `+server.ts` |
| Next.js | `middleware.ts` + `app/api/[...path]/route.ts` |
| Node (Express / Fastify) | middleware + a `/api/*` route |

The entry reads the request, calls one module function, and writes the response. No `if` that
decides anything. It builds the modules once per process (the only place with real `fetch`,
clock and logger).

### What the modules do (no framework imports)

- Sign-in: exchanges the code with the identity provider, stores the tokens, sets the session id cookie.
- Refresh: renews the access token when it expires (the refresh token rotates). Requests that arrive
  together share one renewal. When the identity provider refuses the refresh (expired, revoked, a rotated token used again),
  drop the session. The identity provider decides when a session ends, never the BFF.
- User's IP (when the identity provider checks it): the BFF takes the IP from the connection (the
  framework's client address; behind a proxy, only the proxy's header), never from a header the browser
  sets, and sends it in the provider's header on the code exchange and on every refresh. A request from
  another IP than the session's refreshes at once with that IP: refused → session ends, 401 `ip-changed`;
  provider down → 503, and the old token is never used from the new IP.
- No refresh token (the provider gave none): the access token serves until it expires, then the session
  ends. A refresh answer without one keeps the current one.
- An open connection proxied (SignalR hub, WebSocket): its token was sent when it opened, so after each
  refresh the BFF sends the new token to the upstream for that connection. The BFF never closes it; the
  upstream decides.
- Sign-out: revokes the refresh token at the identity provider, deletes the session, clears the cookie.
- Proxy: forwards `/api/*` to the API with `Authorization: Bearer`.

**That is all a BFF does.** Each of these is a question for the developer, never something to add on
your own, even when it looks safer:

- timeouts, retries, reconnect loops, waits before shutting down;
- refreshing before the token expires, or any other timing number;
- caps (pending sign-ins, sessions, messages, sockets) and cleanup timers;
- validating or limiting what goes to an upstream: the upstream validates and limits itself;
- status codes or socket close codes of its own beyond the cases below.

Errors: the BFF doesn't invent status codes. What an upstream answers (API, identity provider, any
other service), error or not, passes through with its status and body unchanged; never swap it for
the BFF's own. The BFF answers by itself only when the request never got an answer: no session
(`session-expired`, `ip-changed`), wrong origin, upstream down (`api-unavailable`). Same shape
(`{ "error": { "code" } }`), never an exception or a stack.

### What to test

Unit tests, passing fake `fetch`, clock and logger:

- **Sign-in:** valid code → session id cookie with HttpOnly + Secure + SameSite, tokens stored;
  invalid code → no cookie.
- **Refresh:**
  - Expired access → renews; the stored tokens rotate, the cookie keeps the same id.
  - Failed refresh → session deleted, cookie cleared, 401.
  - Two concurrent requests → only one renewal.
  - Another IP → refreshes at once with that IP; refused → 401 `ip-changed`; provider down → 503.
  - No refresh token → the token serves until it expires, then no session; the provider is never called.
- **Logout:** revokes at the identity provider, deletes the session and clears the cookie.
- **Proxy:**
  - Adds the Bearer token; drops the `Cookie` header before calling the API.
  - Passes status and body through unchanged.
  - Only `/api/*` gets through.
- **Security:**
  - No token in any response body, header or cookie to the browser.
  - A mutating request from another origin is refused (CSRF).

Integration: the real entry against a fake HTTP upstream (identity provider + API).

### Observability

Developers must be able to follow any request from the browser to the API and see auth problems
before users report them. One `401` is normal (sessions expire); the signal is the pattern.

**Logger and where the logs go:**

The logging library is **pino**. RDP hasn't chosen the observability tool (where logs and errors
end up) yet: pick it per project, with the team; the tool names below are examples.

- The modules get the logger as a parameter: pino in production, with `redact` on `token`,
  `cookie`, `authorization`, `code` as a safety net; a fake in tests. Not `console.*` in
  production: no levels, no redaction.
- pino writes JSON lines to **stdout**, never to a file. The host collects them (e.g.
  journald under systemd, `docker logs` in a container) and an agent ships them to whatever log
  tool the project uses. The app knows nothing of the destination, so changing the tool touches no
  code.
- Unexpected errors also go to the project's monitoring tool, with the stack.
- .NET (BFF inside the API): `ILogger<T>` is already the port, with Serilog behind it
  (orders example, `Program.cs`); same stdout path.

**1. One line per request**, in the entry (`handle` in `hooks.server.ts`), structured JSON to stdout:

```json
{ "event": "request", "method": "GET", "route": "/api/trainees/:email",
  "status": 200, "durationMs": 84, "upstreamMs": 71, "traceId": "…", "userId": "…" }
```

- `route` is the template, never the real path: paths can carry emails or ids.
- `upstreamMs` = time spent in the API, so "BFF slow" and "API slow" are told apart.
- `userId` is the opaque id from the token (`sub`), never an email or name.

**2. Auth events**, logged by the `auth` module:

| Event | Level |
|---|---|
| `signin.ok` / `signin.failed` (reason: `invalid_code`, `expired`, `idp_down`) | Info / Warning |
| `refresh.ok` / `refresh.failed` (reason: `revoked`, `ip_refused`, `idp_down`) | Info / Warning |
| `session.expired` (no refresh token, the access token expired) | Info |
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
`proxy.failed`, `idp.unavailable`.

**Never logged:** tokens, cookies, sign-in codes, emails or other personal data, request and
response bodies.

**In the front:** the shared HTTP adapter records each request (route, status, duration) as context
for the `Monitoring` port (a "breadcrumb" in Sentry's terms), and the ViewModel's `catch` reports
unexpected failures. That context travels only with a later error, so rate alerts come from the BFF
logs, not the front. Validation and not-found results are not
logged: the user already sees them.

**BFF inside the API (2-tier):** the same events and fields, logged by the API (.NET structured
logging); the BFF and API lines are one log.

**Tests:** the fake logger records the events, so a test checks the event and that no token or
email is in it (e.g. `refresh.failed` logs Warning without the token).

## The front

The front is the same in both shapes:

```
View (page) → OrdersViewModel → OrdersGateway (interface) → HttpOrdersGateway → /api/...
```

- The front is MVVM; the orders example in this plugin shows it (`templates/examples/orders/web/src/`:
  `interface-adapters/screens/orders/OrdersScreen.svelte` and `OrdersViewModel.ts`,
  `application/ports/OrdersGateway.ts`, `infrastructure/data/orders/HttpOrdersGateway.ts`). The
  ViewModel calls the gateway interface; no front use case when the logic is in the API.
- Field validators in the browser only warn before sending. The API validates for real, and both
  sides use the same test cases.
- If logic shows up in a separate BFF, it moves to a use case in the API.

