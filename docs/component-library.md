# Component reference

Two layers, with different rules.

**`src/ui` — primitives.** Small, domain-neutral, styled only through the tokens
in `src/styles/tokens.css`. These are the building blocks. If your organisation
has its own component library, replacing this directory with it is a reasonable
first change.

**`src/components` — reference compositions.** Examples of assembling the
primitives for recurring interactions. Not a library, not a second design system,
and not a home for module workflow.

Start with the [adoption rubric](adopting.md#adoption-rubric), not the export
list. Prefer semantic HTML and an existing primitive. Select a composition only
when its interaction and state model fit, adapt it when the fit is partial, and
delete it when it is unused. If a module-specific workflow does not fit, build it
in the module rather than widening this layer.

What stays fixed: semantic and keyboard-accessible controls, bounded work,
cancellation, stable server-issued identities, server-side authorization, safe
text rendering, and token-based theming. What does not: props, fields, columns,
actions, grouping, tabs, copy, layout, and every piece of example data.

## Primitives

```tsx
import {
  Button, Checkbox, DataTable, DropdownMenu, Icon, LoadingBar,
  Nav, NavItem, NavLink, Notice, Panel, PanelSection,
  SearchInput, Select, TextInput, VerticalNav,
} from "./ui";
```

Notes worth knowing before you use them:

- **`Button`** always sets an explicit `type`. An icon-only button needs an
  `aria-label`. A `count` badge is `aria-hidden`, so a caller showing a count also
  supplies an `aria-label` that says what the number means —
  `DropdownMenu` does this ("Sensitive data, 1 selected"), because a bare
  trailing number reads as nonsense.
- **`TextInput` / `SearchInput` / `Select`** always render a real `<label>`.
  `hiddenLabel` hides it visually while keeping it for assistive technology.
- **`DropdownMenu`** is a controlled disclosure, not an ARIA menu: open state
  lives with the caller, and the content is arbitrary form controls that keep
  native Tab order. It closes on outside click, on Escape (restoring focus to the
  trigger), and when focus leaves entirely. Do not add `role="menu"` unless the
  content becomes a true list of single-action commands.
- **`DataTable`** is a semantic `<table>` that sorts rows already in memory. It
  requires `getRowId` — a server-issued identifier, never a row index — and a
  `caption` stating what the row count means. Absent sort values sort last in both
  directions, so toggling never promotes an empty cell.
- **`Notice`** takes plain text. It renders bodies as text so an API error string
  can never become markup. Use `live="status"` for progress, `live="alert"` for
  errors, and omit it for static copy.
- **`Icon`** is inline SVG, decorative by default. There is no icon font, so
  `font-src 'self'` needs no exception. Add a path to the map rather than a
  dependency.

There is deliberately **no server-side table model**. The v1 file endpoint has no
pagination, sort, or total count, so a client that pretends to page would be
lying about the data. See [the API contract](dxr-public-api.md).

## Theme

`src/styles/tokens.css` is the whole contract: colour, type, spacing, shape, and
motion, in light and dark. Application and primitive CSS reference only `--app-*`
properties — no raw colours, no theme-specific selectors in component styles.

Scheme selection follows the OS:

- `public/theme.js` sets `<html color-scheme="light|dark">` before CSS paints, so
  there is no flash of the wrong scheme;
- `SystemThemeProvider` keeps it in step with `prefers-color-scheme` changes;
- a `@media (prefers-color-scheme: dark)` block in `tokens.css` covers the
  no-JavaScript case.

The pre-paint script is an external file, not inline, because the production CSP
is `script-src 'self'` with no inline allowance. The development server adds a
nonce for Vite's Fast Refresh preamble; the build contains no inline script or
style at all.

`:focus-visible` has one global treatment in `tokens.css`. Do not remove it.

## Selection rubric

| Need | Smallest reasonable starting point |
| --- | --- |
| Static or single-page content | No shell; semantic page structure and primitives |
| Focused tool or report with persistent identity | Minimal masthead, or no shell |
| Shallow sibling views | Top-navigation shell |
| Durable broader hierarchy | Sidebar shell |
| Filtering by classification | Adapt `FilterBuilder` and `CatalogMultiSelect` |
| Showing query results | Adapt `FilesResultsTable` |
| Inspecting one record's metadata | Adapt `FileDetailPanel` |
| Anything else | A module-owned composition built from `src/ui` |

## Navigation shells

`SidebarNavigationShell`, `TopNavigationShell`, and `MinimalNavigationShell`
share one narrow layout boundary:

- `brand` — normally `AppBrand`;
- `navigation` — application-owned semantic navigation (sidebar and top only);
- `utility` — optional session or environment controls;
- `children` — the main content.

The shells own a responsive navigation region, a utility footer, a desktop
collapse action, and an accessible small-screen menu. They do **not** own routes,
active-route logic, workflows, data, filters, tables, or page titles.

A report-style module can use the minimal masthead or no shell at all. Do not add
module-specific controls to a shell.

## Filter builder

`FilterBuilder` composes menus over the classification catalog plus inline fields
for file attributes and entitlements. `CatalogMultiSelect` is one searchable
vocabulary; it selects by **name**, because names are what the query language
matches on.

Two decisions to preserve if you adapt it:

1. **Selections are a draft.** Nothing is requested until the user applies. A
   multi-part filter must not fire a request per checkbox.
2. **The compiled query is visible.** It is how a developer learns the language
   and makes the relationship between controls and request inspectable. The raw
   override in `QueryView` runs through the same `validateQuery` the builder
   obeys, so a malformed query is reported locally instead of becoming an opaque
   400.

Rendered options are capped, with the cap stated in the menu rather than
silently truncating.

## Results table

`FilesResultsTable` supplies columns for `DataTable`. The columns are examples;
change them.

Its caption states that the count is rows read, never a total — the API provides
no match count. It distinguishes "not classified" (a discovery-only scan, where
no annotators were looked for) from "None" (classified, nothing matched), because
conflating them misrepresents coverage.

`formatBytes` and `formatDate` are exported so a detail view formats identically.
Timezone, locale, and precision are application decisions.

## Detail panel

`FileDetailPanel` is a native `<dialog>`, so focus containment, Escape, and inert
background content come from the platform rather than a focus-trap dependency.

Everything it shows came from the row already streamed by the search, so opening
it costs **no** additional request. The API has no single-file metadata endpoint,
and re-querying by `fileId` to populate a detail view would be waste.

File **content** is deliberately absent. Fetching it is a separate decision with
its own exposure and rendering risks: fetch only on explicit user intent, prefer
`redacted-text` with a redactor over raw bytes, and render as inert text. Do not
render HTML, SVG, PDF, Office documents, email, or archives — those need a
separately threat-modelled sandboxed viewer.
