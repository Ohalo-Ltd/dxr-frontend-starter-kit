# API authentication

The Data X-Ray v1 API authenticates with `Authorization: Bearer <token>`, where
the token is a personal access token issued from the Data X-Ray interface.

**That token cannot live in a browser.** Two independent reasons:

1. It is long-lived and broadly privileged. Anything the browser holds is
   readable by the user, by any script that reaches the page, and by anyone with
   access to the device. There is no browser storage location that changes this —
   not `localStorage`, not `sessionStorage`, not a JavaScript-readable cookie,
   not a variable in a closure.
2. The API publishes no CORS headers, so a cross-origin browser request fails
   regardless.

## The required topology

```text
browser  ──►  same-origin backend  ──►  Data X-Ray API
   │              (holds token)
   │
   └─ authenticates as the user, receives only what it is allowed to see
```

The backend is responsible for:

- **Holding the credential.** From a secret manager or a deployment-owned file
  with restricted permissions. Never from an image layer, never from source.
- **Authenticating the user.** The API token says nothing about who is asking.
- **Authorizing per user.** The token's authority almost certainly exceeds any
  individual user's. Without a per-user check, every user inherits the token's
  full reach — the most likely serious mistake in this design.
- **Bounding the request.** Restrict which datasources, paths, and files a user
  may query, and cap result sizes.
- **Normalising errors.** Do not pass upstream error bodies to the browser.

The browser fetches relative paths only. That is why `src/dxr/client.ts` has no
base-URL option and never sets an `Authorization` header, and why
`connect-src 'self'` in the CSP needs no relaxation.

## What this kit ships

`server/dxrProxy.mjs` is a **development** stand-in for that backend. It is a
Vite middleware active for `npm run dev` and `npm run preview`, and inert in a
production build.

It does the credential part correctly:

- reads `DXR_API_TOKEN` and `DXR_API_URL` from the environment;
- attaches the Bearer header server-side, and never logs, echoes, or returns it;
- allowlists exactly the five documented v1 paths and refuses anything else;
- accepts `GET` only;
- pins the upstream host, so a crafted path cannot redirect the request
  elsewhere;
- streams responses through unbuffered, so results render progressively.

It deliberately does **not** do the rest: there is no user authentication, no
per-user authorization, no rate limiting, and no audit trail. **It is not a
production backend.** Deploying it as one would give every visitor the token's
full authority.

For production, either write that backend yourself or configure your reverse
proxy to inject the credential and enforce authorization. If you use nginx,
`deploy/nginx.conf` serves the static bundle and has no `proxy_pass` — adding
one is a deliberate change that needs the authorization story worked out first.

## Running against your sandbox

```sh
cp .env.example .env
# set DXR_API_URL (no trailing slash) and DXR_API_TOKEN
npm run dev
```

Values already present in the environment win over `.env`, so an explicit
`export` or a CI variable overrides the file. With no `DXR_API_TOKEN` at all, the
proxy serves `fixtures/` instead — that is the default so a fresh clone runs with
no credentials.

`.env` is gitignored. Do not commit it, do not paste the token into an issue or a
chat, and do not put it in a model's context.

Issue the token from your Data X-Ray profile's API settings, or ask your
administrator. Scope it as narrowly as the instance allows, and rotate it on a
schedule — it is a real credential with real reach. If it leaks, revoke and
reissue it from the Data X-Ray interface; deleting it from Git history is not
sufficient.

### Self-signed certificates

Some demo instances present a self-signed certificate. Set
`DXR_ALLOW_SELF_SIGNED_TLS=true` to make the dev proxy accept it. This disables
TLS verification for the whole Node process and is for local development only. A
browser has no equivalent escape hatch, which is another reason the proxy exists.

## Rules that do not bend

Never place a token in:

`public/config.json` · the JavaScript bundle · HTML · a URL or query parameter ·
a cookie readable by JavaScript · `localStorage` / `sessionStorage` /
IndexedDB · container environment variables in an image · logs, traces, or crash
reports · command arguments · source control · a model's context

`public/config.json` deserves emphasis: it is fetched by the browser and public
by definition. `parseRuntimeConfig` in `src/config/runtimeConfig.ts` accepts a
strict schema with no room for a credential field, which is intentional.

If a module needs an operator to enter a token, build that form from the
password input primitive, send it once to the backend, and drop it from browser
state immediately. Do not keep it "for convenience".
