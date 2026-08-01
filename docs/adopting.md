# Adopting the starter

Start by deleting starter assumptions, not by filling every slot. Before
feature work, record only the decisions the module actually needs:

- application name, owner, users, environments, and support period;
- authentication issuer, browser session model, logout and revocation, roles,
  scopes, tenancy, and object-level authorization;
- data classes shown in the browser, maximum sizes and counts, retention, export,
  clipboard, print, and file-preview rules;
- **which backend holds the Data X-Ray API token, and how it authorizes each user
  before forwarding a request** — the token is more privileged than any single
  user, so this is the decision that matters most;
- result caps, timeouts, cancellation, and error disclosure;
- how a truncated result set is surfaced to users, since the API cannot report a
  total;
- selected brand mode and reviewed same-origin assets;
- whether persistent navigation is warranted at all;
- required routes and whether a routing dependency is justified;
- accessibility acceptance criteria and supported browsers;
- ingress, TLS, headers, ports, health checks, resource limits, logging,
  monitoring, deployment identity, rollback, and the image registry;
- whether disconnected delivery, FIPS, a customer proxy, or another deployment
  profile is required.

## Repository controls

A template does not copy every repository setting. Before feature work, the
derived repository owner should:

- enable secret scanning, push protection, vulnerability alerts, and security
  updates;
- allow squash merges only, keep pull-request branches updated, and delete merged
  branches;
- protect the default branch from deletion, force pushes, and direct changes;
- require the source, browser, and dependency-review checks to pass with review
  threads resolved;
- add a protected environment for deployment, restricted to the default branch
  and reviewed release tags.

Keep checks that do not apply out of the ruleset rather than creating permanent
skips. Add deployment approval and code-owner requirements once the ownership
model is known.

## Adoption rubric

Apply this in order. “No” is a valid and often preferable answer.

| Question | Default decision |
| --- | --- |
| Can semantic HTML and an existing `src/ui` primitive express the interaction? | Use them directly. Do not add a wrapper for visual preference or hypothetical reuse. |
| Does the application need persistent identity or navigation across views? | If not, use no shell. For a focused tool consider the minimal masthead; for shallow siblings consider top navigation; reserve the sidebar for a durable broader hierarchy. |
| Does a reference composition in `src/components` match the interaction and state model? | Adapt it if the fit is strong. If the workflow differs materially, build your own from primitives. |
| Is the interaction specific to this application? | Keep it in the application. Do not expand a starter component to absorb it. |
| Is the same stable contract needed in several places and missing from `src/ui`? | Add a primitive. Keep it domain-neutral. |
| Is starter code, styling, a fixture, a route, or a dependency unused? | Delete it. Dormant code is maintenance and attack surface, not security evidence. |

## What is fixed and what is adaptable

Fixed, where applicable: server-owned authorization, the secret boundary, exact
dependencies from a single public registry, safe text rendering, bounded work,
cancellation, semantic controls, keyboard access, visible focus, accessible
names, and reachable loading, empty, capped, truncated, denied, and error states.

One of those deserves restating because it is specific to this API: **never
present a result count as a total**, and always surface a truncated stream as
incomplete. See [the API contract](dxr-public-api.md).

Adaptable or removable: shell choice, route model, component props, fields,
columns, actions, grouping, tabs, copy, layout, the token palette, every fixture,
and the whole example page. Document a different implementation when it changes a
trust boundary or an accessibility outcome; no record is needed merely to delete
an irrelevant starter pattern.

Read [Component reference](component-library.md) for the pieces you select.
Delete the Shells gallery, the Files example, and `fixtures/` from a real
application unless they serve a genuine purpose.
