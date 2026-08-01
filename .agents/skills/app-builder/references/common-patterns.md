# Common patterns

Use a section only when the application has the same interaction. These are
composition references, not a product specification: preserve the security and
accessibility properties, and omit fields or states the application does not have.

## Classification-driven filtering

Data X-Ray classifies file **contents**. A file-name search has poor recall — an
invoice may be called `Receipt_2024.pdf` and a file full of national insurance
numbers may be called `Staff_Records.xlsx`. Load `/api/v1/classifications` and
filter on classification fields.

The catalog partitions into four vocabularies: annotators (`annotators.name`),
domains (`annotators.domain.name`), labels (`labels.name`), and extractors
(`extractedMetadata.name`).

- Select by **name**, not id. Names are what the query language matches on.
- Load the catalog once per session. It is stable and can be hundreds of entries.
- Deduplicate by name: a repeated name is one filter option, not two.
- Keep selections a **draft** and commit through an explicit "Apply". A
  multi-part filter must not fire a request per checkbox.
- Show the compiled query. It is how a developer learns the language, and it makes
  the relationship between controls and request inspectable.
- Search within a vocabulary on a bounded query; cap rendered rows and state the
  cap rather than truncating silently.
- Support keyboard traversal, visible focus, and accessible names. Close on
  Escape and restore focus to the trigger.
- Show loading, empty-catalog, no-matches, denied, and unavailable states
  separately.
- Treat the server's catalog as the source of truth. Do not infer availability
  from cached ids or client-side filters.

An empty catalog is a real state: the API may be reachable while returning no
classifications. Say so, and keep the file-attribute filters usable.

There is no v1 endpoint that lists datasources, so a datasource filter can only
be a text match on `datasource.name`. Do not build a datasource picker that
implies enumeration.

## Composing a query

`src/dxr/kql.ts` is the reference. Rules that produce a real HTTP 400 if broken:

- string values are double-quoted, with `\` and `"` escaped;
- wildcards go inside the quotes;
- `AND` / `OR` / `NOT` are uppercase;
- numeric and date comparisons take a bare operator — no colon, no quotes;
- a compared date needs a full datetime, not `YYYY-MM-DD`;
- comparisons are valid only on `size`, `annotators.uniquePhrases`,
  `coordinates.*`, `createdAt`, and `lastModifiedAt`;
- `_exists_` is unsupported — use `annotators.uniquePhrases > 0`;
- there is no free-text search.

Values within one field are OR'd inside parentheses; separate fields are AND'd.
An empty model must still emit a query, because `q` is required — but a match-all
query is unbounded and the UI must say so before running it.

Validate a hand-written query locally before sending it. Reporting "size >= 1000,
not size:>=1000" teaches; an opaque 400 does not.

### Entitlement matching

`entitlements.whoCanAccess: { … }` matches when a **single** account satisfies
every inner condition. Combining conditions across two different accounts must not
match. That property is what makes the over-exposure query — account type `GROUP`,
name `Everyone` — trustworthy, so preserve it in any evaluator or UI copy.

## Streaming results

`GET /api/v1/files` returns a JSONL stream with no pagination, no sort, and no
total count. The only way to bound it is to stop reading.

- Impose a hard row cap and cancel the reader when it is reached.
- Reassemble records across chunk boundaries. A record will be split mid-JSON.
- Deliver rows progressively so results render as they arrive, but batch state
  updates — one update per row re-renders the table hundreds of times.
- Distinguish three outcomes and show each differently:
  - `complete` — the stream ended cleanly;
  - `capped` — the client stopped; more matches exist;
  - `interrupted` — the server stopped mid-record; the result is an unknown
    fraction of the matches.
- **Never label the row count a total.** Say "rows read".
- Cancel the previous request on every new search. A slower earlier response must
  never replace a newer one.
- Skip a row with no `fileId` and report the count of skipped records. A row with
  no identity cannot be selected or referenced.
- Sort and slice client-side over the rows already read, and be honest that this
  is what is happening.
- Map `400`, `401`/`403`, and `504` to specific causes. Never render a response
  body.

## Result tables

- Use a semantic `<table>` with `scope` on headers and `aria-sort` on sortable
  columns, kept in step with the visual indicator.
- Identity is the server-issued `fileId` — never an array index, file name, or
  visible position.
- The caption states what the row count means.
- Distinguish "not classified" (`scanDepth: "DISCOVERY"`, where no annotators
  were looked for) from "none matched" (classified, nothing found). Conflating
  them misrepresents coverage.
- Missing sort values sort last in both directions, so toggling direction never
  promotes an empty cell.
- Wide content scrolls inside its own container; the page must never scroll
  horizontally.
- Batch actions must authorize every target on the server.

There is no v1 label-mutation endpoint, so a results table here is read-only. Do
not add an apply-labels affordance that the API cannot honour.

## Detail views

A search row already contains the file's complete metadata, and there is no
single-file endpoint. Build the detail view from the row you have — opening it
should cost no request.

- Group annotators by domain and show `uniquePhrases`; the count is the useful
  signal.
- Render every field as inert text. Never as markup.
- Show an em dash for an absent field rather than hiding the row, so the absence
  is visible.
- A native `<dialog>` with `showModal()` gives focus containment, Escape, and
  inert background content without a focus-trap dependency.
- Reset to the first tab when the inspected record changes, so the panel never
  opens on a tab holding the previous selection's content.
- Label the access list as what it is: the datasource's reported entitlements, not
  this application's authorization.

## File content

The kit does not fetch file content, and that is a deliberate default.

If an application needs it, treat it as a separate decision with its own review:
fetch only on explicit user intent, never automatically; prefer
`/redacted-text` with a redactor over raw bytes; enforce a byte limit while
streaming rather than after; render as inert text; and treat HTML, SVG, PDF,
Office documents, email, and archives as active content requiring a separately
threat-modelled sandbox.

An empty `redactedText` is a normal outcome for a discovery-only scan, an
unsupported format, or an image-only PDF. Say that, rather than showing an error.

Metadata read, content read, and export are separate permission boundaries. A
browser check affects presentation only; the server authorizes each operation.
