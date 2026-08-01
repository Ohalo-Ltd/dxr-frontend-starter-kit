import { describe, expect, it } from "vitest";
import {
	compileQuery,
	emptyFilterModel,
	isMatchAll,
	MATCH_ALL_QUERY,
	quoteValue,
	toFullDateTime,
	validateQuery,
} from "./kql";

describe("quoteValue", () => {
	it("escapes backslashes and quotes", () => {
		expect(quoteValue('a"b')).toBe('"a\\"b"');
		expect(quoteValue("a\\b")).toBe('"a\\\\b"');
		// The backslash is escaped before the quote, so this stays unambiguous.
		expect(quoteValue('\\"')).toBe('"\\\\\\""');
	});
});

describe("toFullDateTime", () => {
	it("widens a date to midnight UTC, because a bare date fails to parse", () => {
		expect(toFullDateTime("2026-03-12")).toBe("2026-03-12T00:00:00Z");
	});

	it("passes a full datetime through and rejects anything else", () => {
		expect(toFullDateTime("2026-03-12T09:30:00Z")).toBe("2026-03-12T09:30:00Z");
		expect(toFullDateTime("12/03/2026")).toBeUndefined();
		expect(toFullDateTime("")).toBeUndefined();
	});
});

describe("compileQuery", () => {
	it("emits match-all for an empty model, because q is required", () => {
		expect(compileQuery(emptyFilterModel)).toBe(MATCH_ALL_QUERY);
		expect(isMatchAll(emptyFilterModel)).toBe(true);
	});

	it("quotes string values and wraps substring matches in wildcards", () => {
		expect(compileQuery({ ...emptyFilterModel, fileName: "report" })).toBe('fileName:"*report*"');
	});

	it("keeps a caller's own wildcards instead of double-wrapping", () => {
		expect(compileQuery({ ...emptyFilterModel, fileName: "*.pdf" })).toBe('fileName:"*.pdf"');
	});

	it("ORs values within a field and parenthesises the group", () => {
		expect(
			compileQuery({ ...emptyFilterModel, annotators: ["Credit card", "Email address"] }),
		).toBe('(annotators.name:"Credit card" OR annotators.name:"Email address")');
	});

	it("does not parenthesise a single value", () => {
		expect(compileQuery({ ...emptyFilterModel, labels: ["Confidential"] })).toBe(
			'labels.name:"Confidential"',
		);
	});

	it("ANDs separate fields", () => {
		expect(
			compileQuery({ ...emptyFilterModel, annotators: ["Credit card"], labels: ["Confidential"] }),
		).toBe('annotators.name:"Credit card" AND labels.name:"Confidential"');
	});

	it("uses a bare comparison with no colon and no quotes for numbers", () => {
		expect(compileQuery({ ...emptyFilterModel, minSizeBytes: "100000" })).toBe("size >= 100000");
		expect(compileQuery({ ...emptyFilterModel, maxSizeBytes: "5" })).toBe("size <= 5");
		expect(compileQuery({ ...emptyFilterModel, minUniquePhrases: "3" })).toBe(
			"annotators.uniquePhrases >= 3",
		);
	});

	it("ignores a non-numeric size instead of emitting an invalid comparison", () => {
		expect(compileQuery({ ...emptyFilterModel, minSizeBytes: "10MB" })).toBe(MATCH_ALL_QUERY);
	});

	it("emits a full datetime for a compared date", () => {
		expect(compileQuery({ ...emptyFilterModel, createdAfter: "2026-01-31" })).toBe(
			"createdAt >= 2026-01-31T00:00:00Z",
		);
	});

	it("emits a relative date as an unquoted token", () => {
		expect(compileQuery({ ...emptyFilterModel, modifiedWithinDays: "7" })).toBe(
			"lastModifiedAt >= now-7d",
		);
	});

	it("builds an entitlement object literal rather than a dotted path", () => {
		expect(
			compileQuery({ ...emptyFilterModel, accessAccountType: "GROUP", accessName: "Everyone" }),
		).toBe('entitlements.whoCanAccess: { accountType:"GROUP" AND name:"Everyone" }');
	});

	it("escapes a quote inside a selected value", () => {
		expect(compileQuery({ ...emptyFilterModel, labels: ['Legal "hold"'] })).toBe(
			'labels.name:"Legal \\"hold\\""',
		);
	});

	it("drops blank and whitespace-only values", () => {
		expect(compileQuery({ ...emptyFilterModel, annotators: ["", "   "], fileName: "  " })).toBe(
			MATCH_ALL_QUERY,
		);
	});
});

describe("validateQuery", () => {
	it("accepts a well-formed query", () => {
		expect(validateQuery('annotators.name:"Credit card" AND size >= 1000')).toEqual([]);
		expect(validateQuery('entitlements.whoCanAccess: { name:"Everyone" }')).toEqual([]);
	});

	it("requires a query", () => {
		expect(validateQuery("  ")).toHaveLength(1);
	});

	it("rejects lowercase boolean operators", () => {
		expect(validateQuery('fileName:"a" and fileName:"b"').join(" ")).toContain("uppercase");
	});

	it("does not mistake a quoted value for an operator", () => {
		expect(validateQuery('fileName:"cats and dogs"')).toEqual([]);
	});

	it("rejects a colon before a comparison operator", () => {
		expect(validateQuery("size:>=1000").join(" ")).toContain("no colon");
	});

	it("rejects a comparison on a field that does not support one", () => {
		expect(validateQuery("fileName > 5").join(" ")).toContain("does not support comparison");
	});

	it("rejects a date-only value next to a comparison operator", () => {
		expect(validateQuery("createdAt >= 2026-03-12").join(" ")).toContain("full datetime");
	});

	it("rejects _exists_", () => {
		expect(validateQuery('_exists_:"annotators"').join(" ")).toContain("not supported");
	});

	it("rejects an unquoted value", () => {
		expect(validateQuery("fileName:report").join(" ")).toContain("double-quoted");
	});

	it("detects unbalanced quotes and parentheses", () => {
		expect(validateQuery('fileName:"report').join(" ")).toContain("Unbalanced double quote");
		expect(validateQuery('(fileName:"a"').join(" ")).toContain("Unbalanced parenthesis");
	});
});
