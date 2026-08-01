/**
 * Compiles a typed filter model into a Data X-Ray query string, and validates
 * hand-written queries before they reach the API.
 *
 * Every rule below exists because breaking it produces a real HTTP 400 from the
 * server, not because of a style preference:
 *
 * - string values must be double-quoted, with `\` and `"` escaped;
 * - wildcards go inside the quotes: `fileName:"*report*"`;
 * - `AND` / `OR` / `NOT` must be uppercase;
 * - numeric and date fields use a bare comparison operator with no colon and no
 *   quotes: `size > 100000`, never `size:>100000` and never `size:"> 100000"`;
 * - a date compared with an operator needs a full datetime
 *   (`2026-03-12T00:00:00Z`); a bare `2026-03-12` fails to parse;
 * - comparison operators are only valid on the fields in `COMPARABLE_FIELDS`;
 * - `_exists_:` is not supported; test for presence another way, e.g.
 *   `annotators.uniquePhrases > 0`.
 *
 * There is no free-text search. A bare `"some phrase"` is not a query; match a
 * named field instead.
 */

import type { ConnectorType, ScanDepth } from "./types";

/** `q` is required by the API, so an empty model still needs a query. */
export const MATCH_ALL_QUERY = 'fileName:"*"';

/** The only fields that accept `>`, `>=`, `<`, `<=`. */
export const COMPARABLE_FIELDS = [
	"size",
	"annotators.uniquePhrases",
	"coordinates.lat",
	"coordinates.lon",
	"coordinates.alt",
	"createdAt",
	"lastModifiedAt",
] as const;

export type FilterModel = Readonly<{
	/** Matched against `annotators.name`; multiple values are OR'd. */
	annotators: readonly string[];
	/** Matched against `annotators.domain.name`. */
	domains: readonly string[];
	/** Matched against `labels.name`. */
	labels: readonly string[];
	/** Matched against `extractedMetadata.name`. */
	extractors: readonly string[];
	/** Substring match on `extractedMetadata.value`. */
	extractedValue: string;
	/** Substring match on `datasource.name`. */
	datasourceName: string;
	connectorTypes: readonly ConnectorType[];
	/** Substring match on `fileName`. */
	fileName: string;
	/** Substring match on `path`. */
	path: string;
	mimeType: string;
	/** Inclusive lower bound in bytes, emitted as `size >=`. */
	minSizeBytes: string;
	/** Inclusive upper bound in bytes, emitted as `size <=`. */
	maxSizeBytes: string;
	/** `lastModifiedAt >= now-<n>d`. */
	modifiedWithinDays: string;
	/** `createdAt >= <date>T00:00:00Z`, from a `YYYY-MM-DD` input. */
	createdAfter: string;
	/** `annotators.uniquePhrases >= <n>`. */
	minUniquePhrases: string;
	scanDepth: ScanDepth | "";
	metadataExtractionStatus: string;
	/** `entitlements.whoCanAccess { accountType: … }`, e.g. GROUP. */
	accessAccountType: string;
	/** `entitlements.whoCanAccess { name: … }`, e.g. Everyone. */
	accessName: string;
	/** `entitlements.whoCanAccess { email: … }`, accepts a wildcard. */
	accessEmail: string;
}>;

export const emptyFilterModel: FilterModel = {
	accessAccountType: "",
	accessEmail: "",
	accessName: "",
	annotators: [],
	connectorTypes: [],
	createdAfter: "",
	datasourceName: "",
	domains: [],
	extractedValue: "",
	extractors: [],
	fileName: "",
	labels: [],
	maxSizeBytes: "",
	metadataExtractionStatus: "",
	minSizeBytes: "",
	minUniquePhrases: "",
	mimeType: "",
	modifiedWithinDays: "",
	path: "",
	scanDepth: "",
};

/** Quotes and escapes a value for use on the right-hand side of `field:`. */
export function quoteValue(value: string): string {
	return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`;
}

/** Wraps a value in wildcards for a substring match, escaping first. */
function containsClause(field: string, value: string): string | undefined {
	const trimmed = value.trim();
	if (trimmed === "") return undefined;
	// A value the user already wildcarded is passed through unchanged.
	const pattern = trimmed.includes("*") ? trimmed : `*${trimmed}*`;
	return `${field}:${quoteValue(pattern)}`;
}

function exactClause(field: string, value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed === "" ? undefined : `${field}:${quoteValue(trimmed)}`;
}

/** `(field:"a" OR field:"b")` — parenthesised so it AND-composes safely. */
function anyOfClause(field: string, values: readonly string[]): string | undefined {
	const present = values.map((value) => value.trim()).filter((value) => value !== "");
	if (present.length === 0) return undefined;
	const terms = present.map((value) => `${field}:${quoteValue(value)}`);
	return terms.length === 1 ? terms[0] : `(${terms.join(" OR ")})`;
}

/** A bare comparison: no colon, no quotes around the number. */
function comparisonClause(
	field: (typeof COMPARABLE_FIELDS)[number],
	operator: ">=" | "<=" | ">" | "<",
	rawValue: string,
): string | undefined {
	const trimmed = rawValue.trim();
	if (trimmed === "") return undefined;
	if (!/^\d+$/u.test(trimmed)) return undefined;
	return `${field} ${operator} ${trimmed}`;
}

/**
 * The API's parser rejects a date-only literal next to a comparison operator,
 * so a `YYYY-MM-DD` input is widened to midnight UTC.
 */
export function toFullDateTime(date: string): string | undefined {
	const trimmed = date.trim();
	if (trimmed === "") return undefined;
	if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) return `${trimmed}T00:00:00Z`;
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(trimmed)) return trimmed;
	return undefined;
}

/** Entitlement matching uses an object literal, not a dotted path. */
function entitlementClause(model: FilterModel): string | undefined {
	const parts: string[] = [];
	const accountType = model.accessAccountType.trim();
	const name = model.accessName.trim();
	const email = model.accessEmail.trim();

	if (accountType !== "") parts.push(`accountType:${quoteValue(accountType)}`);
	if (name !== "") parts.push(`name:${quoteValue(name)}`);
	if (email !== "") parts.push(`email:${quoteValue(email)}`);
	if (parts.length === 0) return undefined;

	return `entitlements.whoCanAccess: { ${parts.join(" AND ")} }`;
}

/**
 * Builds the query for a filter model.
 *
 * Values inside one field are OR'd; separate fields are AND'd. An empty model
 * compiles to `MATCH_ALL_QUERY`, because the API requires `q` — but a match-all
 * query on a large corpus will be truncated by the server, so the UI must say
 * so rather than presenting the result as complete.
 */
export function compileQuery(model: FilterModel): string {
	const createdAfter = toFullDateTime(model.createdAfter);
	const withinDays = model.modifiedWithinDays.trim();

	const clauses: Array<string | undefined> = [
		anyOfClause("annotators.name", model.annotators),
		anyOfClause("annotators.domain.name", model.domains),
		anyOfClause("labels.name", model.labels),
		anyOfClause("extractedMetadata.name", model.extractors),
		containsClause("extractedMetadata.value", model.extractedValue),
		containsClause("datasource.name", model.datasourceName),
		anyOfClause("datasource.connector.type", model.connectorTypes),
		containsClause("fileName", model.fileName),
		containsClause("path", model.path),
		containsClause("mimeType", model.mimeType),
		comparisonClause("size", ">=", model.minSizeBytes),
		comparisonClause("size", "<=", model.maxSizeBytes),
		comparisonClause("annotators.uniquePhrases", ">=", model.minUniquePhrases),
		// Relative dates are a bare token, never quoted.
		/^\d+$/u.test(withinDays) ? `lastModifiedAt >= now-${withinDays}d` : undefined,
		createdAfter === undefined ? undefined : `createdAt >= ${createdAfter}`,
		exactClause("scanDepth", model.scanDepth),
		exactClause("metadataExtractionStatus", model.metadataExtractionStatus),
		entitlementClause(model),
	];

	const present = clauses.filter((clause): clause is string => clause !== undefined);
	return present.length === 0 ? MATCH_ALL_QUERY : present.join(" AND ");
}

/** True when the model would compile to an unbounded match-all query. */
export function isMatchAll(model: FilterModel): boolean {
	return compileQuery(model) === MATCH_ALL_QUERY;
}

/**
 * Checks a hand-written query against the rules the server enforces.
 *
 * This reports problems rather than silently rewriting the query: a developer
 * learning the language is better served by being told that `size:>=10` is
 * invalid than by having it repaired behind their back.
 */
export function validateQuery(query: string): readonly string[] {
	const problems: string[] = [];
	const trimmed = query.trim();

	if (trimmed === "") {
		problems.push('A query is required. Use fileName:"*" to match everything.');
		return problems;
	}

	// Quote balance first: everything below assumes quotes pair up.
	const unescapedQuotes = trimmed.replace(/\\./gu, "").match(/"/gu)?.length ?? 0;
	if (unescapedQuotes % 2 !== 0) {
		problems.push("Unbalanced double quote.");
	}

	let depth = 0;
	for (const character of trimmed.replace(/"(?:\\.|[^"\\])*"/gu, "")) {
		if (character === "(") depth += 1;
		if (character === ")") depth -= 1;
		if (depth < 0) break;
	}
	if (depth !== 0) {
		problems.push("Unbalanced parenthesis.");
	}

	// Ignore quoted strings when looking for syntax problems, so a value like
	// "and now" cannot trip the operator-case rule.
	const outsideQuotes = trimmed.replace(/"(?:\\.|[^"\\])*"/gu, '""');

	if (outsideQuotes.includes("_exists_")) {
		problems.push(
			"_exists_ is not supported. Test for presence another way, for example annotators.uniquePhrases > 0.",
		);
	}
	if (/(?:^|\s)(?:and|or|not)(?:\s|$)/u.test(outsideQuotes)) {
		problems.push("Boolean operators must be uppercase: AND, OR, NOT.");
	}
	if (/:\s*(?:>=|<=|>|<)/u.test(outsideQuotes)) {
		problems.push("Comparisons take no colon. Write size >= 1000, not size:>=1000.");
	}
	for (const match of outsideQuotes.matchAll(/([A-Za-z][\w.]*)\s*(?:>=|<=|>|<)\s*(\S+)/gu)) {
		const field = match[1] ?? "";
		const value = match[2] ?? "";
		if (!(COMPARABLE_FIELDS as readonly string[]).includes(field)) {
			problems.push(
				`${field} does not support comparison operators. Comparable fields are: ${COMPARABLE_FIELDS.join(", ")}.`,
			);
		}
		if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
			problems.push(`A compared date needs a full datetime: use ${value}T00:00:00Z, not ${value}.`);
		}
		if (value.startsWith('"')) {
			problems.push("Do not quote the right-hand side of a comparison.");
		}
	}
	// `field:value` with no quotes. Object-literal matches such as
	// `entitlements.whoCanAccess: { … }` are legitimate and skipped.
	for (const match of outsideQuotes.matchAll(/([A-Za-z][\w.]*)\s*:\s*([^\s"{)][^\s)]*)/gu)) {
		problems.push(`Values must be double-quoted: ${match[1] ?? ""}:"${match[2] ?? ""}".`);
	}

	return problems;
}
