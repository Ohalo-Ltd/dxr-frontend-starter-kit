# Contributing

This repository is public and accepts pull requests from outside contributors.
Fork it, branch, and open a pull request against `main`.

`main` is protected: it requires a passing CI run and an approving review from
the Ohalo FDE team (see `.github/CODEOWNERS`). An approval from anyone without
write access does not satisfy that requirement, so expect to wait for an Ohalo
reviewer even if others have commented.

Workflow runs on a pull request from a fork use a read-only token and receive no
secrets. A first-time contributor's run needs a maintainer to approve it.

Keep changes small enough to review as a security decision.

1. Explain the user outcome and the affected trust boundaries.
2. For a dependency change, complete the review in
   `docs/security/supply-chain.md` before updating the lock.
3. For UI work, apply the rubric in `docs/adopting.md` and the repository-local
   `app-builder` skill. Explain why a new component is warranted rather than an
   existing primitive.
4. For API work, read `docs/dxr-public-api.md` first. If you change the query
   compiler, extend `src/dxr/kql.test.ts` in the same commit.
5. Add tests for success and for the relevant loading, empty, capped, truncated,
   denied, malformed, and unavailable states.
6. Run `make ci` and `make security`.
7. Require review; do not auto-merge dependency updates.

Do not bypass a failed scanner, use broad suppressions, relax the CSP, enable
dependency scripts, or add a credential to make a build pass. A narrow
suppression must name the exact rule, trace the data flow, identify an owner, and
carry an expiry in your risk register.

Do not add a private or scoped registry. Every dependency resolves from the
public npm registry, which is what lets anyone clone this and run `npm ci` with no
credentials. `scripts/verify-lockfile.mjs` enforces it.

Do not retain a shell, component, route, style, fixture, or dependency because the
starter supplied it. Delete unused references, and keep application-specific
workflow out of `src/ui`.
