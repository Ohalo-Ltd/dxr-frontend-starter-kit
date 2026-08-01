/**
 * A small query evaluator for development fixture mode.
 *
 * IMPORTANT: this is an approximation of the Data X-Ray query language, good
 * enough to make the filter UI meaningful with no credentials and no network.
 * It is NOT the grammar's definition. The server is the only authority: a query
 * that works here can still be rejected live, and matching semantics
 * (case sensitivity, analysis, scoring) will differ. Never treat agreement with
 * this file as evidence that a query is correct.
 *
 * Supported: AND / OR / NOT, parentheses, `field:"value"` with `*` wildcards,
 * bare comparisons on numeric and date fields, `now-<n><unit>` relative dates,
 * and the `entitlements.whoCanAccess { … }` object form.
 */

const COMPARABLE = new Set([
	"size",
	"annotators.uniquePhrases",
	"coordinates.lat",
	"coordinates.lon",
	"coordinates.alt",
	"createdAt",
	"lastModifiedAt",
]);

const RELATIVE_UNITS = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000, w: 604_800_000 };

class QueryError extends Error {}

/* Tokenizer ---------------------------------------------------------------- */

function tokenize(input) {
	const tokens = [];
	let index = 0;

	while (index < input.length) {
		const character = input[index];

		if (/\s/u.test(character)) {
			index += 1;
			continue;
		}
		if (character === "(" || character === ")" || character === "{" || character === "}") {
			tokens.push({ type: character });
			index += 1;
			continue;
		}
		if (character === '"') {
			let value = "";
			index += 1;
			while (index < input.length && input[index] !== '"') {
				if (input[index] === "\\" && index + 1 < input.length) {
					value += input[index + 1];
					index += 2;
					continue;
				}
				value += input[index];
				index += 1;
			}
			if (input[index] !== '"') throw new QueryError("Unbalanced double quote");
			index += 1;
			tokens.push({ type: "string", value });
			continue;
		}

		const twoCharacter = input.slice(index, index + 2);
		if (twoCharacter === ">=" || twoCharacter === "<=") {
			tokens.push({ type: "op", value: twoCharacter });
			index += 2;
			continue;
		}
		if (character === ">" || character === "<") {
			tokens.push({ type: "op", value: character });
			index += 1;
			continue;
		}

		// A bare run: a field path with its trailing colon, a boolean keyword, or a
		// comparison value. Colons are consumed as part of the run so a datetime
		// such as 2026-06-01T00:00:00Z is not shredded into fragments.
		const match = /^[^\s(){}"<>]+/u.exec(input.slice(index));
		if (match === null) throw new QueryError(`Unexpected character ${character}`);
		const word = match[0];
		index += word.length;

		if (word === "AND" || word === "OR" || word === "NOT") {
			tokens.push({ type: word });
			continue;
		}
		if (word.endsWith(":")) {
			tokens.push({ type: "word", value: word.slice(0, -1) });
			tokens.push({ type: ":" });
			continue;
		}
		// A colon inside the run means the value was never quoted.
		const colonIndex = word.indexOf(":");
		if (colonIndex !== -1 && !/^\d{4}-\d{2}-\d{2}T/u.test(word)) {
			throw new QueryError(
				`Values must be double-quoted: ${word.slice(0, colonIndex)}:"${word.slice(colonIndex + 1)}"`,
			);
		}
		tokens.push({ type: "word", value: word });
	}

	return tokens;
}

/* Parser ------------------------------------------------------------------- */

function parse(tokens) {
	let position = 0;

	const peek = () => tokens[position];
	const next = () => tokens[position++];
	const expect = (type) => {
		const token = next();
		if (token?.type !== type) throw new QueryError(`Expected ${type}`);
		return token;
	};

	function parseExpression() {
		let node = parseTerm();
		while (peek()?.type === "OR") {
			next();
			node = { type: "or", left: node, right: parseTerm() };
		}
		return node;
	}

	function parseTerm() {
		let node = parseFactor();
		// Adjacent predicates with no operator are treated as AND, which is what
		// most query languages do and keeps hand-typed queries forgiving.
		while (
			peek() !== undefined &&
			peek().type !== "OR" &&
			peek().type !== ")" &&
			peek().type !== "}"
		) {
			if (peek().type === "AND") next();
			node = { type: "and", left: node, right: parseFactor() };
		}
		return node;
	}

	function parseFactor() {
		if (peek()?.type === "NOT") {
			next();
			return { type: "not", operand: parseFactor() };
		}
		if (peek()?.type === "(") {
			next();
			const node = parseExpression();
			expect(")");
			return node;
		}

		const field = next();
		if (field?.type !== "word") throw new QueryError("Expected a field name");

		if (peek()?.type === "op") {
			const operator = next().value;
			const value = next();
			if (value?.type !== "word") {
				throw new QueryError("A comparison value must be unquoted");
			}
			if (!COMPARABLE.has(field.value)) {
				throw new QueryError(`${field.value} does not support comparison operators`);
			}
			// Resolve the bound now, so an invalid literal is rejected when the query
			// is compiled rather than silently per row during evaluation.
			return {
				type: "compare",
				field: field.value,
				operator,
				bound: toComparable(field.value, value.value),
			};
		}

		expect(":");

		if (peek()?.type === "{") {
			next();
			const inner = parseExpression();
			expect("}");
			return { type: "object", field: field.value, inner };
		}

		const value = next();
		if (value?.type !== "string") {
			throw new QueryError(`Values must be double-quoted: ${field.value}:"…"`);
		}
		return { type: "match", field: field.value, value: value.value };
	}

	const node = parseExpression();
	if (position !== tokens.length) throw new QueryError("Unexpected trailing input");
	return node;
}

/* Evaluation --------------------------------------------------------------- */

/** Resolves a dotted path, flattening arrays into a list of leaf values. */
function resolvePath(value, segments) {
	let current = [value];
	for (const segment of segments) {
		const nextValues = [];
		for (const item of current) {
			if (item === null || item === undefined) continue;
			if (Array.isArray(item)) {
				for (const element of item) {
					const resolved = element?.[segment];
					if (resolved !== undefined) nextValues.push(resolved);
				}
				continue;
			}
			const resolved = item[segment];
			if (resolved !== undefined) nextValues.push(resolved);
		}
		current = nextValues;
	}
	return current.flat();
}

function wildcardToRegExp(pattern) {
	const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/gu, (character) =>
		character === "*" ? "\u0000" : `\\${character}`,
	);
	return new RegExp(`^${escaped.replaceAll("\u0000", ".*")}$`, "iu");
}

function toComparable(field, raw) {
	if (field === "createdAt" || field === "lastModifiedAt") {
		const relative = /^now(?:([+-])(\d+)([smhdw]))?$/u.exec(raw);
		if (relative !== null) {
			const now = Date.now();
			if (relative[1] === undefined) return now;
			const delta = Number(relative[2]) * RELATIVE_UNITS[relative[3]];
			return relative[1] === "-" ? now - delta : now + delta;
		}
		// The live parser rejects a date-only literal next to a comparison
		// operator, so reject it here too rather than being quietly permissive.
		if (/^\d{4}-\d{2}-\d{2}$/u.test(raw)) {
			throw new QueryError(`A compared date needs a full datetime: use ${raw}T00:00:00Z`);
		}
		const parsed = Date.parse(raw);
		if (Number.isNaN(parsed)) {
			throw new QueryError(`A compared date needs a full datetime, received ${raw}`);
		}
		return parsed;
	}
	const numeric = Number(raw);
	if (Number.isNaN(numeric)) throw new QueryError(`${field} expects a number`);
	return numeric;
}

function evaluate(node, row) {
	switch (node.type) {
		case "and":
			return evaluate(node.left, row) && evaluate(node.right, row);
		case "or":
			return evaluate(node.left, row) || evaluate(node.right, row);
		case "not":
			return !evaluate(node.operand, row);
		case "match": {
			const test = wildcardToRegExp(node.value);
			return resolvePath(row, node.field.split(".")).some(
				(value) => typeof value !== "object" && test.test(String(value)),
			);
		}
		case "compare": {
			const bound = node.bound;
			return resolvePath(row, node.field.split(".")).some((value) => {
				const left =
					node.field === "createdAt" || node.field === "lastModifiedAt"
						? Date.parse(String(value))
						: Number(value);
				if (Number.isNaN(left)) return false;
				if (node.operator === ">") return left > bound;
				if (node.operator === ">=") return left >= bound;
				if (node.operator === "<") return left < bound;
				return left <= bound;
			});
		}
		case "object": {
			// The object form matches when a SINGLE element satisfies every inner
			// predicate — not when the predicates are spread across elements.
			const candidates = resolvePath(row, node.field.split("."));
			return candidates.some((candidate) => evaluate(node.inner, candidate));
		}
		default:
			throw new QueryError("Unsupported query node");
	}
}

/**
 * Compiles a query into a row predicate.
 *
 * Throws `QueryError` for a query the real server would also reject, so fixture
 * mode can exercise the UI's invalid-query state.
 */
export function compileFixturePredicate(query) {
	const trimmed = String(query ?? "").trim();
	if (trimmed === "") throw new QueryError("A query is required");
	if (trimmed.includes("_exists_")) {
		throw new QueryError("_exists_ is not supported by this API");
	}
	if (/(?:^|\s)(?:and|or|not)(?:\s|$)/u.test(trimmed.replace(/"(?:\\.|[^"\\])*"/gu, '""'))) {
		throw new QueryError("Boolean operators must be uppercase: AND, OR, NOT");
	}
	if (/:\s*(?:>=|<=|>|<)/u.test(trimmed)) {
		throw new QueryError("Comparisons take no colon, for example: size >= 1000");
	}

	const node = parse(tokenize(trimmed));
	return (row) => evaluate(node, row);
}

export { QueryError };
