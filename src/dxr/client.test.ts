import { afterEach, describe, expect, it, vi } from "vitest";
import { DxrApiError, listFiles, MAX_ROWS_LIMIT } from "./client";

function row(fileId: string, overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		datasource: { connector: { type: "AMAZON_S3" }, id: "ds-1", name: "Corpus" },
		entitlements: { whoCanAccess: [] },
		fileId,
		fileName: `${fileId}.txt`,
		labels: [],
		size: 10,
		...overrides,
	});
}

/** Serves the given string body as a byte stream, in the given chunk sizes. */
function streamResponse(body: string, chunkSizes?: readonly number[]): Response {
	const bytes = new TextEncoder().encode(body);
	let offset = 0;
	let chunkIndex = 0;

	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (offset >= bytes.byteLength) {
				controller.close();
				return;
			}
			const size = chunkSizes?.[chunkIndex] ?? bytes.byteLength;
			chunkIndex += 1;
			controller.enqueue(bytes.slice(offset, offset + size));
			offset += size;
		},
	});

	return new Response(stream, {
		headers: { "content-type": "application/jsonlines" },
		status: 200,
	});
}

function mockFetch(response: Response | (() => Response | Promise<Response>)) {
	const produce = typeof response === "function" ? response : () => response;
	// Typed to accept the fetch argument list so call assertions can read it.
	const spy = vi.fn((..._args: unknown[]) => produce());
	vi.stubGlobal("fetch", spy);
	return spy;
}

describe("listFiles", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("parses a JSONL stream and reports completion", async () => {
		mockFetch(streamResponse(`${row("a")}\n${row("b")}\n`));

		const result = await listFiles({ query: 'fileName:"*"' });

		expect(result.rows.map((item) => item.fileId)).toEqual(["a", "b"]);
		expect(result.outcome).toBe("complete");
		expect(result.malformedLines).toBe(0);
	});

	it("sends the query as the only parameter, URL-encoded", async () => {
		const spy = mockFetch(streamResponse(""));

		await listFiles({ query: 'labels.name:"A B" AND size >= 1' });

		expect(spy.mock.calls[0]?.[0]).toBe(
			"/api/v1/files?q=labels.name%3A%22A%20B%22%20AND%20size%20%3E%3D%201",
		);
	});

	it("reassembles records split across chunk boundaries", async () => {
		// One byte at a time: every record is split mid-JSON.
		const body = `${row("a")}\n${row("b")}\n`;
		mockFetch(streamResponse(body, new Array(body.length).fill(1)));

		const result = await listFiles({ query: "q" });

		expect(result.rows.map((item) => item.fileId)).toEqual(["a", "b"]);
		expect(result.outcome).toBe("complete");
	});

	it("stops at maxRows and reports the result as capped", async () => {
		const body = `${row("a")}\n${row("b")}\n${row("c")}\n`;
		mockFetch(streamResponse(body));

		const seen: string[] = [];
		const result = await listFiles({
			maxRows: 2,
			onRow: (item) => seen.push(item.fileId),
			query: "q",
		});

		expect(result.rows).toHaveLength(2);
		expect(result.outcome).toBe("capped");
		// onRow fires progressively and never beyond the cap.
		expect(seen).toEqual(["a", "b"]);
	});

	it("clamps maxRows to the hard limit", async () => {
		const body = new Array(20)
			.fill(0)
			.map((_value, index) => row(`f${index}`))
			.join("\n");
		mockFetch(streamResponse(`${body}\n`));

		const result = await listFiles({ maxRows: MAX_ROWS_LIMIT + 5_000, query: "q" });

		expect(result.rows).toHaveLength(20);
	});

	it("treats a truncated final record as an interrupted stream", async () => {
		// The server stopped mid-JSON: the tail cannot parse.
		mockFetch(streamResponse(`${row("a")}\n{"fileId":"b","fileNa`));

		const result = await listFiles({ query: "q" });

		expect(result.rows.map((item) => item.fileId)).toEqual(["a"]);
		expect(result.outcome).toBe("interrupted");
		expect(result.malformedLines).toBe(1);
	});

	it("accepts a final record with no trailing newline", async () => {
		mockFetch(streamResponse(`${row("a")}\n${row("b")}`));

		const result = await listFiles({ query: "q" });

		expect(result.rows.map((item) => item.fileId)).toEqual(["a", "b"]);
		expect(result.outcome).toBe("complete");
	});

	it("skips a row with no server-issued id rather than indexing by position", async () => {
		mockFetch(streamResponse(`${row("a")}\n{"fileName":"orphan.txt"}\n`));

		const result = await listFiles({ query: "q" });

		expect(result.rows).toHaveLength(1);
		expect(result.malformedLines).toBe(1);
	});

	it("maps 400 to an invalid-query error", async () => {
		mockFetch(new Response("no viable alternative at input", { status: 400 }));

		await expect(listFiles({ query: "size:>=1" })).rejects.toMatchObject({
			kind: "invalid-query",
		});
	});

	it("maps 403 to a denied error and never leaks the response body", async () => {
		mockFetch(new Response("token expired for tenant xyz", { status: 403 }));

		const error = await listFiles({ query: "q" }).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(DxrApiError);
		expect((error as DxrApiError).kind).toBe("denied");
		expect((error as DxrApiError).message).not.toContain("tenant xyz");
	});

	it("maps 504 to a timeout error", async () => {
		mockFetch(new Response("", { status: 504 }));

		await expect(listFiles({ query: "q" })).rejects.toMatchObject({ kind: "timeout" });
	});

	it("reports an aborted search distinctly", async () => {
		const controller = new AbortController();
		mockFetch(() => {
			controller.abort();
			throw new DOMException("aborted", "AbortError");
		});

		await expect(listFiles({ query: "q", signal: controller.signal })).rejects.toMatchObject({
			kind: "aborted",
		});
	});
});
