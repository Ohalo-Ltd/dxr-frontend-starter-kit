# Agent guide

This repository is a security baseline. A passing test suite does not permit
weakening an invariant.

## Non-negotiable invariants

- Fail closed when runtime configuration, identity, authorization, API state, or
  security evidence is missing, malformed, ambiguous, denied, expired, or
  unavailable.
- Treat browser authorization checks as user experience only. The server must
  enforce tenant, role, scope, datasource, label, file, and export access.
- Never put an API token, credential, refresh token, private key, or secret in
  browser code, browser storage, `public/config.json`, source, logs, command
  arguments, container environment variables, or model context. The browser talks
  to a same-origin backend; only that backend holds the API credential.
- Never present a result count as a total. The v1 file endpoint reports no match
  count and truncates broad queries mid-stream. `complete`, `capped`, and
  `interrupted` are three different outcomes and the UI must distinguish them.
- Keep direct dependencies exact and the lockfile committed. Every package
  resolves from the public npm registry. Do not add Git, URL, file, directory, or
  floating dependencies.
- Dependency lifecycle scripts remain denied. A package that requires one needs a
  written threat analysis and a narrowly pinned allowlist entry; never use
  `--dangerously-allow-all-scripts`.
- Do not use a package executor to fetch unreviewed code. Run only commands
  already present in the exact lock.
- Use the tokens in `src/styles/tokens.css` and the primitives in `src/ui`. Do
  not introduce raw colours, app-owned dark-mode overrides, a second styling
  system, or a UI dependency for a cosmetic shortcut.
- Preserve semantic HTML, accessible names, keyboard operation, visible focus,
  bounded lists, and explicit loading/empty/error/denied states. Never use
  `dangerouslySetInnerHTML`; never render an API error body or file content as
  markup.
- Customer logos and other runtime assets must be same-origin reviewed files. Do
  not relax the CSP or add a CDN as a shortcut.
- Production is a static SPA: no SSR, React Server Components, runtime Node,
  service worker, writable application files, or dynamic code loading unless a
  real use case is documented and threat-modeled first. `server/` is development
  tooling and is never deployed.
- Build one image, scan that digest, create its SBOM and provenance, sign it, and
  deploy the verified digest.
- Keep docs, tests, threat model, and control evidence current with behaviour. Do
  not claim certification from mappings or scanner output.

## Before touching the API layer

Read `docs/dxr-public-api.md`. The v1 surface is five `GET` endpoints with no
pagination, no sort, no total count, and no datasource, label-mutation, or
aggregate operations. Do not build UI that implies otherwise, and do not call
`/api/v1/files/{id}/text` — it is not in the specification.

Query-language rules are encoded in `src/dxr/kql.ts` with a test per rule. Each
one corresponds to a real HTTP 400. If you change the compiler, extend
`src/dxr/kql.test.ts` first.

File content is the most exposing call in the API. Fetch it only on an explicit
user action — never on open, never on tab selection. Redacted text is the default
path; the unredacted original is a separate click behind its own warning.
Classify by media type *and* file extension and let the more dangerous answer
win; never render an active format (PDF, Office, SVG, HTML, XML, archive) inline.
Cap the download while streaming, not after.

## Skill routing

For any UI component, page, application shell, filter, results table, or detail
view, read `.agents/skills/app-builder/SKILL.md` before acting.

For dependency, workflow, container, SBOM, provenance, signing, or deployment
changes, apply `docs/security/supply-chain.md`; never soften a gate because a tool
is unavailable.

## Required commands

Use targeted tests while iterating. Before declaring a normal change complete:

```sh
make ci
make security
```

Before release or deployment changes:

```sh
make release-gate
```

## Reevaluate, do not cargo-cult

Security and accessibility outcomes are constraints. Component APIs, shell
choice, page structure, routes, fields, columns, tabs, copy, and workflow are
not.

Start with semantic HTML and an existing `src/ui` primitive. Add a reference
component from `src/components` only when its interaction and state model fit;
adapt it when the fit is partial; delete it when it is unused. A shell is
optional. Do not widen a reference component into a generic framework merely to
preserve starter code.

Use the rubric in `docs/adopting.md` before selecting a shell or composition.
Record the real use case before adding authentication, routing, browser file
rendering, persistence, analytics, third-party content, real-time connections,
offline support, or a deployment profile. Remove unused code and packages.
