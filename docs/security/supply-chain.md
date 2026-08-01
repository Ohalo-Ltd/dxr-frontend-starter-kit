# Supply-chain security

## Install policy

The exact Node and npm versions are committed and `make ci` verifies the active
toolchain plus agreement between `.node-version`, `engines`, and
`packageManager`. Direct dependencies use exact versions and `npm ci` enforces
the lock. The lock verifier requires:

- lockfile version 3;
- SHA-512 integrity for every installed package;
- **every** package resolved from `https://registry.npmjs.org/` — there is no
  private registry and therefore no exception to make;
- no Git, URL, file, directory, link, or workspace dependency;
- no dependency marked with an install script except the exact reviewed
  development-only `fsevents` entries described below.

`.npmrc` sets `allow-git=none`, `allow-remote=none`, and
`strict-allow-scripts=true`; `package.json` has an empty `allowScripts` policy.
This fails instead of silently running or newly blocking an unreviewed script.
A seven-day release-age window applies to every new resolution, with no scope
exempted. Locked installs remain reproducible.

Keep it this way. A single scoped registry line in `.npmrc` would reintroduce a
credential requirement and make a clean `npm ci` impossible for anyone without
it.

### Narrow optional-script exception

The locked development graph contains `fsevents` `2.3.2` and `2.3.3` as
Darwin-only optional accelerators beneath test/build tooling. They declare
install scripts, but the application and production bundle do not require
them. Every install path in this repository passes `--ignore-scripts`, and the
empty npm 12 `allowScripts` policy fails closed if that flag is accidentally
removed.

The lock verifier allows only those exact package paths, versions, optional,
development, and operating-system attributes. A version, path, platform,
production-scope, or graph change fails the gate and requires a new review.
This is not an allowlist for executing either script.

These controls reflect npm 12's
[secure install defaults](https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/)
and the [npm configuration contract](https://docs.npmjs.com/cli/v12/using-npm/config/).
They directly address attack paths such as malicious post-install scripts, Git
`prepare` scripts, remote tarball substitution, typosquatting, dependency
confusion, and newly compromised versions.

## Dependency change review

Do not auto-merge. For each direct or material transitive change:

1. State the product capability that requires it and why platform code is
   insufficient.
2. Confirm package name, owner, registry, source repository, release tag, and
   maintainer/release history.
3. Inspect the published tarball and compare it to source/build output.
4. Review lifecycle scripts, native binaries, dynamic code loading, network and
   filesystem behavior, optional dependencies, and dependency count.
5. Check advisories, license, release age, current maintenance, and OpenSSF
   posture where available.
6. Review the lock diff, including every new registry URL and integrity value.
7. Run `make ci` and `make security`.
8. Require human review and record any narrow, expiring risk acceptance in your
   own risk register.

Never use `npm audit fix --force`, a floating range, `latest`, a Git branch, or
`--dangerously-allow-all-scripts` to clear a gate.

The license gate requires SPDX metadata for every package and denies
copyleft/source-available licenses outside your product policy. There is no
exemption for missing license metadata: a package that declares none fails.

## CI and release

Untrusted pull-request code receives no secrets. Installs run with
`--ignore-scripts`, so dependency scripts cannot execute. Actions are pinned to
full commit SHAs and workflows use minimal permissions.

Because every dependency is public, no workflow needs registry credentials at
all. `.github/workflows/ci.yml` requests only `contents: read`. If you later add
a private dependency, you are also adding a credential to every build — decide
that deliberately.

Release must:

1. build the image once in an isolated job;
2. identify the immutable digest;
3. scan that digest and retain JSON evidence;
4. generate SBOM and provenance for the same digest;
5. publish to one registry, recording which;
6. sign the digest;
7. deploy only after identity, signature, provenance, and digest verification.

This repository ships no release workflow: the destination registry, identity
provider, and signing policy are yours to choose. `make image` and
`make image-scan` cover the local half.

A blocking release scan uploads its JSON as a failure artifact before the job
stops. A successful release retains the scan beside its SBOM and immutable
image digest in the release-evidence artifact.

The broader
[OWASP software supply-chain guidance](https://cheatsheetseries.owasp.org/cheatsheets/Software_Supply_Chain_Security_Cheat_Sheet.html)
recommends isolated builds and scanning final artifacts. Scanner output is
evidence, not proof of safety or certification.
