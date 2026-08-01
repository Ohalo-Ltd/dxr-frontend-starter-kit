# Deployment

The production image builds static assets with Node and serves them from a
digest-pinned Chainguard Nginx image. Node, npm, a shell, compilers, and package
managers are absent from the runtime stage. The process runs as UID/GID 65532,
listens on port 8080, and writes temporary Nginx state only under `/tmp`.

Required operator inputs:

- the exact image digest and the baseline `linux/amd64` platform;
- TLS-terminating ingress and hostname;
- read-only `config.json` and reviewed branding files;
- CPU, memory, process, and temporary-storage limits;
- HTTP liveness probe `GET /healthz`;
- expected same-origin API route and network policy;
- log destination, monitoring, rollback digest, and retention period.

Run the container with a read-only root filesystem, all Linux capabilities
dropped, `no-new-privileges`, bounded `/tmp`, and no ambient cloud credentials.
The static server needs no egress.

Example runtime configuration mount:

```text
/deployment/config.json -> /usr/share/nginx/html/config.json (read-only)
```

`/config.json` is served with `Cache-Control: no-store`; hashed `/assets/` are
served with long-lived immutable caching semantics. Do not place secrets in
either location.

## The API route

The static server has no egress and no `proxy_pass`. Requests to `/api/v1/*` must
be routed by your ingress to the backend that holds the API credential and
enforces per-user authorization. Do not add a `proxy_pass` straight to Data X-Ray
from this container: it has no way to authenticate a user, so every visitor would
inherit the token's full authority. See
[API authentication](api-authentication.md).

`server/dxrProxy.mjs` is development tooling and is not present in the image.

## Release

This repository ships no release workflow, because the destination registry,
identity provider, and signing policy depend on your infrastructure. Whatever you
build must:

1. build the image once, in an isolated job;
2. scan that exact digest and retain the JSON evidence;
3. generate an SBOM and provenance for the same digest;
4. publish to one registry and record which;
5. sign the digest, preferring keyless signing over a static key;
6. deploy only after verifying identity, signature, provenance, and digest.

Deploy by digest, never by a mutable tag. `make image` and `make image-scan` cover
the local half of this.
