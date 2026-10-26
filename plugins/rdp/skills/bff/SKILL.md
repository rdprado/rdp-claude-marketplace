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
  through the BFF adds latency and load (IETF §6.1.4.3). Consider adjusting the API as well, so the
  browser reaches that stream directly; discuss it with the team first.

The front is the same in both:

```
page → field validator (pure function, warning only)
page → TraineesClient (interface, via context) → HttpTraineesClient → /api/...
```

- Field validators in the browser only warn before sending. The API validates for real, and both
  sides use the same test cases.
- If logic shows up in a separate BFF, it moves to a use case in the API.

