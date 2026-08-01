# Threat model

## Protected assets

- user identity and browser session;
- customer, tenant, datasource, label, file, preview, and export data;
- the Data X-Ray API token and any application credentials;
- source, package, build, image, and release integrity;
- customer branding and operator configuration;
- vulnerability, SBOM, provenance, and deployment evidence.

## Trust boundaries and controls

| Boundary | Primary threats | Baseline controls |
| --- | --- | --- |
| npm registry to developer/CI | lifecycle RCE, Git prepare scripts, remote tarballs, dependency confusion, lock substitution | npm 12, exact direct pins, v3 lock, SHA-512 integrity, scripts/Git/remote denied, single public registry enforced, release-age window |
| pull request to CI | token theft, cache poisoning, workflow injection | read-only defaults, no registry credential needed at all, no `pull_request_target`, pinned actions, no secrets with untrusted code |
| build to runtime image | rebuild substitution, vulnerable base, tool leakage | build once, digest-pinned bases, shell-free non-root runtime, scan/SBOM/provenance/sign exact digest |
| deployment to browser | config substitution, weak headers, stale assets | read-only public config, strict schema, no-store config, CSP with no inline allowance in the build, same-origin assets, immutable hashed bundles |
| browser to backend | credential theft, confused deputy, IDOR, over-fetching | same-origin relative requests only, server-enforced per-user authz, bounded result caps, cancellation, generic errors that never echo an upstream body |
| backend to Data X-Ray API | token theft, privilege escalation beyond the user's authority | token held only server-side from a secret manager, path allowlist, host pinning, per-user authorization applied before forwarding |
| file content to DOM | stored XSS, parser exploits, resource exhaustion | safe text by default, no raw HTML, no automatic content fetch, size/type bounds, sandbox reviewed renderers |

## Residual risks

- An allowed package can contain malicious runtime code without an install
  script. Review, lock, testing, scanning, release age, and monitoring reduce
  but do not eliminate this risk.
- Registry or maintainer compromise can produce a malicious validly signed
  package version. Exact lock integrity prevents silent replacement, not a
  deliberately reviewed malicious update.
- Frontend code and runtime config are public to the user. Secrets cannot be
  protected there.
- CSP cannot replace safe rendering or server authorization.
- **The API token is more privileged than any single user.** The backend that
  holds it is the only thing preventing every user from inheriting its full
  reach. `server/dxrProxy.mjs` deliberately does *not* provide that control — it
  is development tooling. This is the most consequential residual risk in the
  design; see [API authentication](../api-authentication.md).
- A truncated result set is indistinguishable from a complete one at the protocol
  level. The client infers truncation from an unparseable tail, which is reliable
  for a cut stream but cannot detect a server that stops cleanly on a boundary.
  Treat any broad-query count as a lower bound.

Derived applications must replace this generic model with their actual topology,
identities, data classification, maximums, and abuse cases.
