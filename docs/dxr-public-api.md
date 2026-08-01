# The Data X-Ray public API, version 1

This is the contract the kit is built against. Read it before extending
`src/dxr`: the endpoint set is small and fixed, and its limitations shape the UI
rather than being worked around.

Authoritative source: the `v1-api-spec.json` OpenAPI 3.1 document published with
Data X-Ray ("Data X-Ray External API"). Ask your Ohalo contact for the copy that
matches your instance version — the surface does change across releases.

## The whole surface

Five endpoints. All `GET`. All authenticated with
`Authorization: Bearer <token>`.

| Endpoint | Returns |
| --- | --- |
| `GET /api/v1/files?q=<query>` | `application/jsonlines` — one file metadata object per line |
| `GET /api/v1/files/{id}/content` | The file's bytes, in its original format |
| `GET /api/v1/files/{id}/redacted-text?redactor_id=<int>` | `{ status, data: { redactedText } }` |
| `GET /api/v1/classifications` | `{ status, data: [ … ] }` — the classification catalog |
| `GET /api/v1/redactors` | `{ status, data: [ … ] }` — redaction profiles |

There is **no** endpoint for listing datasources, mutating labels, or fetching
aggregate counts. If you need those, you need a different interface — do not
build UI that implies they exist.

Two traps worth stating explicitly:

- `GET /api/v1/files/{id}/text` is **not in the specification**, even though some
  Ohalo tooling calls it. Do not build on it.
- There is no `GET /api/v1/files/{id}`. To fetch one file's metadata you query
  `?q=fileId:"…"`. In practice you rarely need to: a search already returned the
  complete metadata for every row, which is why this kit's detail panel makes no
  additional request.

## Three constraints that drive the design

### 1. No pagination, no sort, no total count

`q` is the *only* parameter the file endpoint accepts. There is no `limit`,
`offset`, `from`, `size`, `sort`, or cursor, and the response has no envelope
carrying a match count.

So a client cannot page. It can only start reading and stop. `listFiles` in
`src/dxr/client.ts` takes `maxRows`, cancels the stream when it hits the cap, and
reports the outcome as `capped`. Sorting happens on the rows already read.

**Never present a row count as a total.** The UI says "rows read", every time.

### 2. Broad queries are truncated, silently

The stream is bounded by a response-size budget and per-chunk timeouts. A
match-all query against a large corpus stops part-way through — mid-record — and
you receive an unknown fraction of the matches with no error status.

This is why the client distinguishes three outcomes:

| Outcome | Meaning | UI obligation |
| --- | --- | --- |
| `complete` | The server ended the stream cleanly | Show the results |
| `capped` | This client stopped at `maxRows` | Say more matches exist |
| `interrupted` | The server stopped mid-record, or the connection dropped | Say the results are incomplete and unquantified |

`interrupted` is detected by a non-empty, unparseable tail after the stream ends.
Treating it as success would be a correctness bug, so the page raises a
persistent warning, not a dismissible toast.

Fixture mode reproduces this deliberately: a match-all query truncates after
eight rows so the path is testable offline.

### 3. The token is not a browser credential

The Bearer token is long-lived and broadly privileged, and the API publishes no
CORS headers. A browser cannot call it directly and must not hold the token. See
[API authentication](api-authentication.md).

## The query language

Data X-Ray classifies file **contents**. Querying by file name has poor recall —
an invoice may be called `Receipt_2024.pdf`, and a file full of national
insurance numbers may be called `Staff_Records.xlsx`. Load
`/api/v1/classifications` and query the classification fields instead. That is
what the filter builder in this kit does.

### Fields

- **Core**: `fileId`, `fileName`, `path`, `size`, `mimeType`, `contentSha256`,
  `scanDepth`, `createdAt`, `lastModifiedAt`
- **Datasource**: `datasource.id`, `datasource.name`,
  `datasource.connector.type`
- **Labels**: `labels.id`, `labels.name`, `dlpLabels.name`,
  `dlpLabels.dlpSystem`, `dlpLabels.type`
- **Annotators** (what was found inside the file): `annotators.name`,
  `annotators.domain.name`, `annotators.uniquePhrases`,
  `annotators.annotations.phrase`
- **Entitlements**: `entitlements.whoCanAccess` and its `accountType`, `name`,
  `email`
- **Ownership**: `owner.name`, `owner.email`, `createdBy.*`, `modifiedBy.*`
- **Extracted metadata**: `extractedMetadata.name`, `extractedMetadata.value`,
  `extractedMetadata.type`, `metadataExtractionStatus`
- **Coordinates**: `coordinates.lat`, `coordinates.lon`, `coordinates.alt`

Availability varies by instance version and configuration. Confirm against your
own spec copy.

### Grammar

Each rule below corresponds to a real `400`. `src/dxr/kql.ts` encodes them and
`validateQuery` reports violations before a request is sent.

```text
fileName:"*report*"                       string values are quoted; wildcards go inside
labels.name:"Legal hold" AND size >= 1000 AND / OR / NOT must be uppercase
size >= 100000                            comparisons take no colon and no quotes
createdAt >= 2026-03-12T00:00:00Z         a compared date needs a full datetime
lastModifiedAt >= now-7d                  relative dates are a bare token
annotators.uniquePhrases > 0              how to test for presence
entitlements.whoCanAccess: { accountType:"GROUP" AND name:"Everyone" }
(a OR b) AND c                            parentheses group
```

Rejected forms:

| Wrong | Right | Why |
| --- | --- | --- |
| `fileName:report` | `fileName:"report"` | Values must be quoted |
| `size:>=1000` | `size >= 1000` | A comparison takes no colon |
| `createdAt >= 2026-03-12` | `createdAt >= 2026-03-12T00:00:00Z` | The parser needs a full datetime |
| `fileName:"a" and fileName:"b"` | `… AND …` | Operators are uppercase |
| `_exists_:"annotators"` | `annotators.uniquePhrases > 0` | `_exists_` is unsupported |
| `"John Smith"` | `annotators.annotations.phrase:"*John*"` | There is no free-text search |
| `fileName > 5` | — | Only `size`, `annotators.uniquePhrases`, `coordinates.*`, `createdAt`, `lastModifiedAt` are comparable |

Comparison operators are valid **only** on those numeric and date fields.

### Entitlement matching

`entitlements.whoCanAccess: { … }` matches when a **single** account on the file
satisfies every inner condition. A file shared with a `USER` called "Alice" and a
`GROUP` called "Legal" does **not** match
`{ accountType:"USER" AND name:"Legal" }`. This is what makes the over-exposure
query — account type `GROUP`, name `Everyone` — trustworthy.

## Response shape

`GET /api/v1/files` emits one JSON object per line with no wrapper. Required
fields are `datasource`, `fileName`, `fileId`, `size`, `labels`, and
`entitlements`; everything else is optional and genuinely absent on some files.

Two absences that mean different things, and should never be conflated in a UI:

- `scanDepth: "DISCOVERY"` — the file was found but never classified. No
  annotators were looked for.
- `scanDepth: "DISCOVERY_AND_CLASSIFICATION"` with an empty `annotators` — the
  file was classified and nothing matched.

`src/dxr/types.ts` mirrors the spec's optionality exactly, so the compiler forces
you to handle both.

## File content

`GET /api/v1/files/{id}/content` returns the original bytes. This kit does not
call it, and fixture mode does not simulate it.

If a module needs a preview, treat it as a separate decision with its own review:
fetch only on explicit user intent, never automatically; prefer
`redacted-text` with a redactor over raw content; render as inert text, never as
HTML; and treat PDFs, Office documents, and SVGs as active content requiring a
sandbox. An empty `redactedText` is a normal outcome for a discovery-only scan,
an unsupported format, or an image-only PDF.

## Errors

Bodies are plain text and may be empty. `src/dxr/client.ts` maps status to an
actionable cause and never renders a response body:

| Status | Meaning |
| --- | --- |
| `400` | The query was rejected — check field names and operators |
| `401` / `403` | The credential lacks permission or has expired |
| `504` | The server timed out; the query is too broad |
