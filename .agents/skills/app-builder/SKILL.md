---
name: app-builder
description: Build or review frontend interfaces in this starter kit — its own UI primitives, design tokens, application shells, and the Data X-Ray public API v1 layer. Use for components, tokens, themes, navigation, classification filters, query building, result tables, detail views, streaming and truncation handling, loading and error states, and accessibility.
---

# App builder

This kit has two UI layers and one API layer. Respect the boundaries.

- **`src/ui`** — domain-neutral primitives over the tokens in
  `src/styles/tokens.css`. No third-party UI dependency, no raw colours.
- **`src/components`** — adaptable reference compositions. Examples, not a
  library, and not a home for module workflow.
- **`src/dxr`** — the only place that knows the API exists.

Begin with no abstraction. Use semantic HTML and an existing primitive when they
express the interaction without distortion. Adopt a composition only when its
interaction and state model match; tailor it when the match is partial; delete it
when unused. Security and accessibility outcomes are constraints. Props, fields,
columns, actions, copy, grouping, tabs, and layout are not.

## Required workflow

1. Apply the adoption rubric in `../../../docs/adopting.md`. Write down the
   information hierarchy, workflow, data bounds, authorization boundary, and
   accessibility needs before choosing UI.
2. If the change touches the API, read `../../../docs/dxr-public-api.md` first.
   The surface is five `GET` endpoints with no pagination, no sort, and no total
   count. Do not invent capabilities it lacks.
3. Prefer semantic HTML and a `src/ui` primitive. Do not wrap one solely for
   visual consistency or hypothetical reuse.
4. Read `references/common-patterns.md` only for a matching filter, result-list,
   or detail interaction. Read `references/shell-patterns.md` only when
   persistent navigation is warranted.
5. Classify each building block:
   - existing primitive: use it directly;
   - matching composition: adapt it without widening its contract for unrelated
     needs;
   - application-specific interaction: build it in the application from
     primitives;
   - genuinely reusable and missing: add a domain-neutral primitive to `src/ui`.
6. Identify the trust boundaries the interaction actually crosses.
7. Implement and test every reachable state: loading, empty, capped, truncated,
   denied, unavailable, stale, and success. Bound and cancel network work.
8. Test keyboard operation, visible focus, accessible names, and safe rendering.
9. Delete unused demos, components, styles, fixtures, routes, and dependencies.
10. Run `make ci` and `make security`.

## Styling rules

- Reference only `--app-*` tokens from `src/styles/tokens.css`. No raw colours,
  no hex values in component CSS, no application-owned dark-mode overrides.
- A rebrand is a change to `tokens.css` alone. If you find yourself editing
  component CSS to change a colour, the token is missing.
- Set `<html color-scheme>` before first paint. `public/theme.js` does this;
  `SystemThemeProvider` keeps it current. Never pin the page to one scheme.
- Keep the pre-paint script external. The production CSP is `script-src 'self'`
  with no inline allowance, and the build contains no inline script or style.
- Preserve semantic HTML. A styled `div` is not a button, table, heading, or
  navigation landmark.
- Keep the single global `:focus-visible` treatment.
- Never render untrusted HTML or use `dangerouslySetInnerHTML`. Treat SVG, PDF,
  and rich document formats as active content needing a separate reviewed
  sandbox.
- Do not weaken the CSP, load remote fonts, icons, or images, or add a UI
  dependency for a cosmetic shortcut. The icon set is inline SVG and the font
  stack is the system stack precisely so the policy needs no exceptions.
- Keep workflow state explicit. Controlled inputs are the default when state is
  shared, applied later, synchronised, or validated by the server.

## API rules

- The browser makes same-origin relative requests only. It never holds an API
  token and never sets an `Authorization` header. See
  `../../../docs/api-authentication.md`.
- Query-grammar rules live in `src/dxr/kql.ts`, each corresponding to a real HTTP
  400. Extend `src/dxr/kql.test.ts` before changing the compiler.
- `listFiles` returns `complete`, `capped`, or `interrupted`. All three are
  distinct UI states. Folding `interrupted` into success is a correctness bug.
- Never label a row count as a total.
- Row identity is the server-issued `fileId`, never an array index, file name, or
  visible position.
- Do not add a request to fetch what a search already returned. A file's full
  metadata arrives with the search row.
- Do not call `/api/v1/files/{id}/text` — it is not in the specification.
- Errors are mapped to causes without echoing response bodies. Keep it that way:
  an upstream error string must not reach the DOM, even as text.

## Review checklist

Reject an applicable change that:

- puts a credential in browser code, storage, `public/config.json`, the bundle, a
  URL, or a log;
- presents a row count as a total, or a truncated result as complete;
- uses a row index as identity;
- streams without a hard row cap, or fails to cancel a superseded request;
- treats a hidden control as authorization;
- fetches file content automatically rather than on explicit user intent;
- renders an API error or document content as HTML;
- makes a consequential selection or mutation ambiguous, or applies a destructive
  change without proportionate confirmation;
- omits a reachable loading, empty, capped, truncated, denied, or unavailable
  state;
- introduces a raw colour, a second styling system, or a UI dependency;
- pins the page to light mode or flashes the wrong scheme before React mounts;
- adds a dependency from a registry other than the public npm registry.
