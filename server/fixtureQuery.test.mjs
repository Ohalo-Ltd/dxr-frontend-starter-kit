// @vitest-environment node
// This exercises development server code, which runs in Node, not a browser.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileFixturePredicate, QueryError } from "./fixtureQuery.mjs";

const rows = readFileSync(new URL("../fixtures/files.jsonl", import.meta.url), "utf8")
	.split("\n")
	.filter((line) => line.trim() !== "")
	.map((line) => JSON.parse(line));

function match(query) {
	const predicate = compileFixturePredicate(query);
	return rows.filter(predicate).map((row) => row.fileName);
}

describe("fixture corpus", () => {
	it("is well formed and uniquely identified", () => {
		expect(rows).toHaveLength(16);
		expect(new Set(rows.map((row) => row.fileId)).size).toBe(16);
	});
});

describe("compileFixturePredicate", () => {
	it("matches everything for the match-all query", () => {
		expect(match('fileName:"*"')).toHaveLength(16);
	});

	it("filters by annotator name", () => {
		expect(match('annotators.name:"Credit card"')).toEqual([
			"Q1-supplier-invoices.xlsx",
			"corporate-card-statements.csv",
		]);
	});

	it("filters by annotator domain, across nested objects", () => {
		expect(match('annotators.domain.name:"Health Information"')).toEqual([
			"occupational-health-report.pdf",
			"patient-transfer-log.xlsx",
		]);
	});

	it("filters by label", () => {
		expect(match('labels.name:"Legal hold"')).toEqual([
			"master-services-agreement.pdf",
			"nda-northwind-2025.docx",
		]);
	});

	it("filters by extracted metadata value with a wildcard", () => {
		expect(match('extractedMetadata.value:"*agreement*"')).toEqual([
			"master-services-agreement.pdf",
			"nda-northwind-2025.docx",
		]);
	});

	it("ANDs separate fields", () => {
		// master-services-agreement.pdf qualifies through its Email address
		// annotator, which sits in the PII domain — content, not file name.
		expect(match('annotators.domain.name:"PII" AND labels.name:"Confidential"')).toEqual([
			"new-starter-records.csv",
			"master-services-agreement.pdf",
			"payroll-export-june.xlsx",
		]);
	});

	it("ORs within a parenthesised group", () => {
		expect(
			match('(annotators.name:"Medical diagnosis" OR annotators.name:"Credit card")'),
		).toHaveLength(4);
	});

	it("supports NOT", () => {
		const withHold = match('labels.name:"Legal hold"').length;
		expect(match('fileName:"*" AND NOT labels.name:"Legal hold"')).toHaveLength(16 - withHold);
	});

	it("compares size numerically, not lexically", () => {
		// employee-handbook-2026.docx is 998400 bytes and must fall below the bound.
		expect(match("size >= 1000000")).toEqual([
			"master-services-agreement.pdf",
			"equipment-photo.jpg",
			"audit-trail-archive.zip",
		]);
	});

	it("compares annotator phrase counts", () => {
		expect(match("annotators.uniquePhrases >= 200")).toEqual(["corporate-card-statements.csv"]);
	});

	it("compares dates using a full datetime", () => {
		expect(match("createdAt >= 2026-06-01T00:00:00Z")).toEqual([
			"vendor-price-schedule.xlsx",
			"site-survey-notes.txt",
			"equipment-photo.jpg",
			"scanned-expenses.pdf",
			"payroll-export-june.xlsx",
		]);
	});

	it("matches the entitlement object form against a single account", () => {
		expect(match('entitlements.whoCanAccess: { accountType:"GROUP" AND name:"Everyone" }')).toEqual(
			[
				"employee-handbook-2026.docx",
				"new-starter-records.csv",
				"corporate-card-statements.csv",
				"retention-schedule.md",
				"patient-transfer-log.xlsx",
			],
		);
	});

	it("does not satisfy an object match by combining two different accounts", () => {
		// vendor-price-schedule has a GROUP "Legal Team" and a USER "Procurement
		// Lead". Requiring USER + "Legal Team" together must not match it.
		expect(
			match('entitlements.whoCanAccess: { accountType:"USER" AND name:"Legal Team" }'),
		).toEqual([]);
	});

	it("filters by connector type", () => {
		expect(match('datasource.connector.type:"AMAZON_S3"')).toHaveLength(4);
	});

	it("filters by scan depth, finding discovery-only files", () => {
		expect(match('scanDepth:"DISCOVERY"')).toEqual([
			"equipment-photo.jpg",
			"audit-trail-archive.zip",
		]);
	});

	it("rejects the invalid forms the real server rejects", () => {
		expect(() => compileFixturePredicate("size:>=1000")).toThrow(QueryError);
		expect(() => compileFixturePredicate('fileName:"a" and fileName:"b"')).toThrow(QueryError);
		expect(() => compileFixturePredicate('_exists_:"annotators"')).toThrow(QueryError);
		expect(() => compileFixturePredicate("fileName:report")).toThrow(QueryError);
		expect(() => compileFixturePredicate('fileName:"report')).toThrow(QueryError);
		expect(() => compileFixturePredicate("fileName > 5")).toThrow(QueryError);
		expect(() => compileFixturePredicate("")).toThrow(QueryError);
	});

	it("rejects a date-only comparison value, as the server does", () => {
		expect(() => compileFixturePredicate("createdAt >= 2026-03-12")).toThrow(QueryError);
	});
});
