import { afterEach, describe, expect, it, vi } from "vitest";
import {
	classifyContent,
	DxrApiError,
	decodeUtf8,
	getClassifications,
	getFileContent,
	getRedactedText,
	listFiles,
	MAX_ROWS_LIMIT,
} from "./client";

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

describe("bounded JSON reads", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("parses a normal JSON response", async () => {
		mockFetch(
			() =>
				new Response(JSON.stringify({ status: "ok", data: [{ id: "a" }] }), {
					headers: { "content-type": "application/json" },
					status: 200,
				}),
		);

		await expect(getClassifications()).resolves.toEqual([{ id: "a" }]);
	});

	it("abandons a JSON body that exceeds the cap with no Content-Length", async () => {
		// The header is a claim, not a guarantee. A server that omits it must not
		// be able to make the client buffer without limit.
		let pulls = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls += 1;
				if (pulls > 5_000) {
					controller.close();
					return;
				}
				// 64 KiB per chunk: 5,000 chunks is well past the 4 MiB ceiling.
				controller.enqueue(new Uint8Array(64 * 1024));
			},
		});
		mockFetch(
			() =>
				new Response(stream, {
					headers: { "content-type": "application/json" },
					status: 200,
				}),
		);

		await expect(getRedactedText("f1", 1)).rejects.toMatchObject({ kind: "unavailable" });
		// It stopped part-way rather than reading everything first.
		expect(pulls).toBeLessThan(5_000);
	});

	it("still rejects early when Content-Length declares an oversized body", async () => {
		const spy = mockFetch(
			() =>
				new Response("{}", {
					headers: { "content-length": String(64 * 1024 * 1024) },
					status: 200,
				}),
		);

		await expect(getClassifications()).rejects.toMatchObject({ kind: "unavailable" });
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("decodes multi-byte characters split across chunk boundaries", async () => {
		const payload = new TextEncoder().encode(JSON.stringify({ status: "ok", data: ["café"] }));
		let offset = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (offset >= payload.byteLength) {
					controller.close();
					return;
				}
				// One byte at a time splits the é in half.
				controller.enqueue(payload.slice(offset, offset + 1));
				offset += 1;
			},
		});
		mockFetch(() => new Response(stream, { status: 200 }));

		await expect(getClassifications()).resolves.toEqual(["café"]);
	});
});

describe("classifyContent", () => {
	it("treats plain text types as renderable", () => {
		expect(classifyContent("text/plain", "notes.txt")).toBe("text");
		expect(classifyContent("text/csv", "rows.csv")).toBe("text");
		expect(classifyContent("application/json", "data.json")).toBe("text");
		expect(classifyContent("text/plain; charset=utf-8", "notes.txt")).toBe("text");
	});

	it("treats scriptable and complex-parser formats as active", () => {
		for (const [type, name] of [
			["application/pdf", "report.pdf"],
			["image/svg+xml", "logo.svg"],
			["text/html", "page.html"],
			["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "book.xlsx"],
			["application/zip", "bundle.zip"],
		] as const) {
			expect(classifyContent(type, name)).toBe("active");
		}
	});

	it("lets a dangerous extension override a benign declared type", () => {
		// A datasource reporting an SVG as text/plain must not make it renderable.
		expect(classifyContent("text/plain", "logo.svg")).toBe("active");
		expect(classifyContent("text/plain", "invoice.pdf")).toBe("active");
		expect(classifyContent("application/octet-stream", "macro.docm")).toBe("binary");
	});

	it("falls back to binary for anything unrecognised", () => {
		expect(classifyContent("image/png", "photo.png")).toBe("binary");
		expect(classifyContent("", "mystery")).toBe("binary");
	});
});

describe("decodeUtf8", () => {
	it("decodes valid UTF-8", () => {
		expect(decodeUtf8(new TextEncoder().encode("héllo"))).toBe("héllo");
	});

	it("throws on invalid UTF-8 rather than emitting replacement characters", () => {
		expect(() => decodeUtf8(new Uint8Array([0xff, 0xfe, 0xfd]))).toThrow();
	});
});

describe("getFileContent", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function binaryResponse(body: Uint8Array | string, headers: Record<string, string> = {}) {
		const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
		return new Response(bytes as BodyInit, {
			headers: { "content-type": "text/plain", ...headers },
			status: 200,
		});
	}

	it("requests the content endpoint with an encoded id", async () => {
		const spy = mockFetch(() => binaryResponse("hello"));

		await getFileContent("a/b c");

		expect(spy.mock.calls[0]?.[0]).toBe("/api/v1/files/a%2Fb%20c/content");
	});

	it("returns the bytes and classifies them", async () => {
		mockFetch(() => binaryResponse("line one\nline two"));

		const content = await getFileContent("f1", { fileName: "notes.txt" });

		expect(decodeUtf8(content.bytes)).toBe("line one\nline two");
		expect(content.disposition).toBe("text");
		expect(content.mediaType).toBe("text/plain");
	});

	it("prefers the filename the server supplies", async () => {
		mockFetch(() =>
			binaryResponse("x", { "content-disposition": 'attachment; filename="server-name.txt"' }),
		);

		const content = await getFileContent("f1", { fileName: "fallback.txt" });

		expect(content.fileName).toBe("server-name.txt");
	});

	it("strips a path from a server-supplied filename", async () => {
		mockFetch(() =>
			binaryResponse("x", {
				"content-disposition": 'attachment; filename="../../etc/passwd"',
			}),
		);

		const content = await getFileContent("f1", { fileName: "fallback.txt" });

		expect(content.fileName).toBe("passwd");
	});

	it("rejects before downloading when Content-Length exceeds the cap", async () => {
		const spy = mockFetch(() => binaryResponse("x".repeat(50), { "content-length": "50" }));

		await expect(getFileContent("f1", { maxBytes: 10 })).rejects.toMatchObject({
			kind: "unavailable",
		});
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("aborts mid-stream when the cap is exceeded despite a missing Content-Length", async () => {
		// A server can under-report or omit the length, so the running total is
		// what actually enforces the limit.
		let pulls = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls += 1;
				if (pulls > 100) {
					controller.close();
					return;
				}
				controller.enqueue(new Uint8Array(32));
			},
		});
		mockFetch(
			() => new Response(stream, { headers: { "content-type": "text/plain" }, status: 200 }),
		);

		await expect(getFileContent("f1", { maxBytes: 64 })).rejects.toMatchObject({
			kind: "unavailable",
		});
		// It stopped early rather than reading all 100 chunks.
		expect(pulls).toBeLessThan(10);
	});

	it("maps 403 to denied without leaking the body", async () => {
		mockFetch(() => new Response("token expired for tenant xyz", { status: 403 }));

		const error = await getFileContent("f1").catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(DxrApiError);
		expect((error as DxrApiError).kind).toBe("denied");
		expect((error as DxrApiError).message).not.toContain("tenant xyz");
	});

	it("maps 404 to not-found", async () => {
		mockFetch(() => new Response("", { status: 404 }));

		await expect(getFileContent("missing")).rejects.toMatchObject({ kind: "not-found" });
	});
});
