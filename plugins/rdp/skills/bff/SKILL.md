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
  by it.
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

