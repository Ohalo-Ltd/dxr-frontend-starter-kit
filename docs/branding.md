# Product identity

The application's name comes from validated runtime configuration, never from a
hardcoded string, so one build can ship under different names for different
deployments.

## Module mode

The default. The mark plus the application name:

```json
{
  "appName": "Records review",
  "brand": {
    "mode": "module"
  }
}
```

The name appears in the document title, the accessible page structure, and
persistent navigation where the application has it.

## Customer mode

Pairs the application identity with a customer logo:

```json
{
  "appName": "Records review",
  "brand": {
    "mode": "customer",
    "customerName": "Example customer",
    "customerLogoPath": "/branding/customer-logo.svg"
  }
}
```

The logo path must begin with `/branding/`, be same-origin, and contain no
traversal, query, or fragment. `isSafeAssetPath` in
`src/config/runtimeConfig.ts` enforces this, and `img-src 'self' data:` in the
CSP blocks a remote image even if validation were bypassed. Place the asset under
`public/branding/` during the build.

Never accept an arbitrary URL, an upload, SVG markup, a data URL, or an HTML
fragment from runtime configuration. SVG is active content: a logo supplied at
runtime is a script-execution vector, which is why only a path to a
build-reviewed file is permitted.

## Replacing the starter identity

`public/favicon.svg` and `src/components/navigation/AppBrand.tsx` carry a neutral
placeholder mark. Replace both, and set `index.html`'s `<title>` — it is the
pre-mount fallback before `config.json` is read.

Colours come from `src/styles/tokens.css`. Change `--app-accent` and its
companions there rather than in component styles, and check both light and dark:
the accent needs sufficient contrast against `--app-surface` in each.

If you use a customer's logo, confirm contractual permission, minimum clear
space, contrast, accessible name, and behaviour on light and dark backgrounds
with whoever owns that brand.

Brand mode does not dictate application structure and does not require a shell.
The shells accept the same replaceable brand slot — see
[Component reference](component-library.md).
