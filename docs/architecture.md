# Architecture

## Deliberately narrow baseline

A client-rendered React SPA with three runtime dependencies: `react`,
`react-dom`, and nothing else. Presentation primitives are local
(`src/ui`), styled entirely through the tokens in `src/styles/tokens.css`. There
is no private registry, no design-system package, and no UI framework to keep in
step.

```text
browser
  |
  | GET /config.json           (public, same origin, no-store, validated)
  | GET static hashed assets
  | GET /api/v1/*              (same origin, relative — never cross-origin)
  v
customer ingress / application gateway
  |
  +-- static frontend container (this repository)
  |
  +-- application backend  ── holds the API credential, authorizes per user
        |
        +-- Data X-Ray v1 API
```

The backend hop is not optional. The API credential is a privileged bearer token
and the API sends no CORS headers, so the browser can neither hold it nor reach
the API directly. See [API authentication](api-authentication.md).

Runtime configuration is fetched with redirects denied, bounded to 16 KiB, and
validated against a closed schema before React mounts. Unknown keys, invalid
brand modes, remote logo URLs, and path traversal all fail closed to a generic
error page. Configuration is public and must never contain secrets.

## Layers

| Layer | Owns | Notes |
| --- | --- | --- |
| `src/styles/tokens.css` | Colour, type, spacing, shape, motion | The entire theming contract. A rebrand is this file. |
| `src/ui` | Primitives — button, field, table, notice, menu, nav | Semantic HTML first. No third-party UI dependency. |
| `src/dxr` | API types, query compilation, streaming, catalog | The only place that knows the API exists. |
| `src/components` | Adaptable reference compositions | Examples. Delete what you do not use. |
| `src/app` | Pages and the view switch | Replace entirely for a real module. |
| `src/config` | Runtime configuration loading and validation | Worth keeping as-is. |
| `server/` | Development proxy and fixture mode | Never deployed. |

Dependency direction is one-way: `app` → `components` → `ui` → `styles`, with
`dxr` used by `app` and `components` but never the reverse. `src/ui` knows nothing
about files, queries, or classifications, so it stays reusable.

## What is intentionally absent

- **A design-system dependency.** `src/ui` is deliberately small and yours. If
  your organisation has a component library, replacing `src/ui` with it is a
  reasonable first change.
- **A router.** Two views do not justify one. Adopt a router for a documented
  navigation model, pin it exactly, and review its transitive graph first.
- **A data-fetching library.** `src/dxr/client.ts` is a few hundred lines of
  `fetch` with explicit cancellation and bounds. A caching library would add
  surface without solving the actual problem, which is that the API has no
  pagination.
- **A server-side table model.** The API offers no server pagination or sort, so
  the table sorts the bounded rows it already has. Pretending otherwise would be
  a lie about the data.
- **SSR / React Server Components.** They add a server runtime and serialization
  boundary this baseline does not need.
- **A service worker.** It complicates revocation and can retain sensitive
  responses. Add one only with explicit cache classification.
- **Third-party assets, fonts, and analytics.** Everything is same-origin so the
  CSP needs no exceptions. The icon set is inline SVG and the font stack is the
  system stack, for exactly this reason.

## Ownership

The server owns authorization. Browser checks are user experience only: hiding a
button is not an access control. This matters more than usual here, because the
API credential held by your backend is likely more privileged than any individual
user — see [API authentication](api-authentication.md).

`src/components` and `src/app` are examples. Their props, columns, fields, copy,
and layout are all adaptable. What is not adaptable is the set of outcomes they
handle: loading, empty, capped, truncated, denied, unavailable, and error are all
distinct states because the API can produce all of them.
