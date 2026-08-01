# Optional navigation shell boundaries

The kit demonstrates three navigation-only shells:

- sidebar navigation for several durable destinations;
- top navigation for a small, shallow set of sibling destinations;
- a minimal identity masthead for a focused tool or report.

Start with no persistent shell. Add one only when users need durable application
identity or navigation across views:

- no persistent navigation: use page content directly;
- focused tool or report: use the minimal masthead only if identity or a small
  utility action needs a durable place;
- shallow sibling views: consider top navigation;
- durable, broader hierarchy: consider sidebar navigation.

These are decision prompts, not destination-count thresholds. If the information
architecture does not fit, build an application-owned layout from `src/ui`
primitives instead of expanding these shells.

When used, each shell owns layout only. Its inputs are brand, optional utility,
main content, and navigation in the sidebar and top variants. The top variant's
compact identity row scrolls away while the tab row stays available. The minimal
variant is a single identity and utility row with no navigation.

Routing, active-route state, page tools, filters, query state, view selectors,
tables, reports, and workflow controls belong to the application, not the shell.

Use the semantic surface, border, shadow, typography, spacing, and navigation
tokens from `src/styles/tokens.css`. A shell must inherit the active scheme; never
ship a separate "dark sidebar" palette.

Branding is orthogonal: the application name comes from validated runtime
configuration, and customer mode adds a reviewed same-origin logo. Keep the
application name visible and accessible in every variant.

Navigation visibility is not authorization. The server owns access decisions.
