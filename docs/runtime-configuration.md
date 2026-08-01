# Runtime configuration

`public/config.json` contains public deployment-owned settings. The same image
can be promoted across environments while the operator mounts a different
read-only file at `/usr/share/nginx/html/config.json`.

| Field | Required | Rule |
| --- | --- | --- |
| `appName` | yes | trimmed non-empty text, maximum 80 characters |
| `brand.mode` | yes | `module` or `customer` |
| `brand.customerName` | customer only | non-empty text, maximum 80 characters |
| `brand.customerLogoPath` | customer only | reviewed same-origin `/branding/` path, maximum 256 characters, conservative filename characters only |

The parser rejects unknown fields so a misspelling cannot silently weaken a
deployment. The same-origin fetch requires a JSON media type, rejects redirects,
times out after five seconds, and reads at most 16 KiB of valid UTF-8 before
parsing. Browser caching is disabled and production Nginx sends
`Cache-Control: no-store` for `/config.json`. The app does not mount if any
check fails.

Never put secrets, private endpoints containing credentials, tokens, customer
data, feature-flag payloads containing sensitive values, or authorization
decisions in this file.
