/**
 * Client for the Data X-Ray external API, version 1.
 *
 * All requests are same-origin and relative. In development that is the proxy
 * in `server/dxrProxy.mjs`; in production it must be an application backend on
 * the same origin. The browser never holds an API token, so nothing here reads,
 * stores, or sends an `Authorization` header — see docs/api-authentication.md.
 *
 * Two properties of the file endpoint shape this whole module:
 *
 * 1. It returns a JSONL stream with no envelope, no total count, and no
 *    pagination. The only way to bound the work is to stop reading, which is
 *    what `maxRows` does.
 * 2. A broad query is truncated by the server mid-stream. That is reported as a
 *    distinct outcome rather than folded into success, because presenting a
 *    truncated result as complete is a correctness bug, not a cosmetic one.
 */

import type { ApiEnvelope, Classification, FileMetadata, Redactor } from "./types";

const API_ROOT = "/api/v1";

/** Absolute ceiling on rows per query, independent of what a caller asks for. */
export const MAX_ROWS_LIMIT = 500;
export const DEFAULT_MAX_ROWS = 200;

const METADATA_TIMEOUT_MS = 30_000;
/** Reset on every chunk: a healthy stream keeps producing data. */
const CHUNK_TIMEOUT_MS = 30_000;
const MAX_STREAM_BYTES = 32 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;

export type DxrErrorKind =
	| "aborted"
	| "denied"
	| "invalid-query"
	| "not-found"
	| "timeout"
	| "unavailable";

/**
 * A failure with a cause the UI can act on.
 *
 * The message is written for a person and never contains a response body: an
 * upstream error string must not reach the DOM, even as text.
 */
export class DxrApiError extends Error {
	readonly kind: DxrErrorKind;
	readonly status: number | undefined;

	constructor(kind: DxrErrorKind, message: string, status?: number) {
		super(message);
		this.name = "DxrApiError";
		this.kind = kind;
		this.status = status;
	}
}

function errorForStatus(status: number): DxrApiError {
	if (status === 400) {
		return new DxrApiError(
			"invalid-query",
			"The server rejected the query. Check the field names and operators.",
			status,
		);
	}
	if (status === 401 || status === 403) {
		return new DxrApiError(
			"denied",
			"Access was denied. The API credential may lack permission or have expired.",
			status,
		);
	}
	if (status === 404) {
		return new DxrApiError("not-found", "The requested resource does not exist.", status);
	}
	if (status === 504 || status === 408) {
		return new DxrApiError(
			"timeout",
			"The server timed out. The query is probably too broad for this instance.",
			status,
		);
	}
	return new DxrApiError("unavailable", "The API is unavailable.", status);
}

/** Combines a caller's signal with a timeout, and always clears the timer. */
async function fetchJson<T>(path: string, signal: AbortSignal | undefined): Promise<T> {
	const timeoutSignal = AbortSignal.timeout(METADATA_TIMEOUT_MS);
	const combined = signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]);

	let response: Response;
	try {
		response = await fetch(`${API_ROOT}${path}`, {
			cache: "no-store",
			credentials: "same-origin",
			headers: { Accept: "application/json" },
			redirect: "error",
			signal: combined,
		});
	} catch (error) {
		if (signal?.aborted === true) {
			throw new DxrApiError("aborted", "The request was cancelled.");
		}
		if (error instanceof DOMException && error.name === "TimeoutError") {
			throw new DxrApiError("timeout", "The request timed out.");
		}
		throw new DxrApiError("unavailable", "The API could not be reached.");
	}

	if (!response.ok) throw errorForStatus(response.status);

	const text = await readBoundedText(response, MAX_JSON_BYTES);
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new DxrApiError("unavailable", "The response was not valid JSON.");
	}
}

/**
 * Reads a response body as text, refusing to buffer more than `maxBytes`.
 *
 * `response.json()` and `response.text()` both buffer the whole body first, so
 * a `Content-Length` check alone is not a limit — the header is a claim the
 * server makes, and it can be absent or wrong. The running total is what
 * actually bounds memory, exactly as the file-content path does.
 */
async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
	const declaredLength = response.headers.get("content-length");
	if (declaredLength !== null && Number(declaredLength) > maxBytes) {
		throw new DxrApiError("unavailable", "The response was larger than this client accepts.");
	}

	if (response.body === null) return "";

	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8");
	let text = "";
	let total = 0;

	try {
		while (true) {
			const result = await reader.read();
			if (result.done) break;
			total += result.value.byteLength;
			if (total > maxBytes) {
				await reader.cancel();
				throw new DxrApiError(
					"unavailable",
					"The response exceeded the size this client accepts and was abandoned.",
				);
			}
			text += decoder.decode(result.value, { stream: true });
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}

	return text + decoder.decode();
}

/**
 * The classification catalog: every annotator, domain, label, and extractor the
 * instance can detect. This is the query vocabulary — load it before offering
 * filters, because searching by file name alone has poor recall against a
 * corpus that is classified by content.
 */
export async function getClassifications(signal?: AbortSignal): Promise<readonly Classification[]> {
	const body = await fetchJson<ApiEnvelope<readonly Classification[]>>("/classifications", signal);
	return Array.isArray(body.data) ? body.data : [];
}

/** Redaction profiles available for `getRedactedText`. */
export async function getRedactors(signal?: AbortSignal): Promise<readonly Redactor[]> {
	const body = await fetchJson<ApiEnvelope<readonly Redactor[]>>("/redactors", signal);
	return Array.isArray(body.data) ? body.data : [];
}

/**
 * Redacted text for one file.
 *
 * An empty string is a normal result, not an error: a discovery-only scan, an
 * unsupported format, or an image-only PDF all produce no extractable text.
 */
export async function getRedactedText(
	fileId: string,
	redactorId: number,
	signal?: AbortSignal,
): Promise<string> {
	const body = await fetchJson<ApiEnvelope<{ redactedText?: string }>>(
		`/files/${encodeURIComponent(fileId)}/redacted-text?redactor_id=${encodeURIComponent(String(redactorId))}`,
		signal,
	);
	return typeof body.data?.redactedText === "string" ? body.data.redactedText : "";
}

/** Default ceiling for a single file body. Raise deliberately, per module. */
export const DEFAULT_MAX_CONTENT_BYTES = 8 * 1024 * 1024;
const CONTENT_TIMEOUT_MS = 120_000;

/**
 * How the browser is allowed to treat a file body.
 *
 * - `text`: safe to render as inert text.
 * - `active`: carries scripting or a complex parser — HTML, SVG, PDF, Office,
 *   archives. Never render it inline; hand it to the user as a download.
 * - `binary`: anything else. Download only.
 *
 * This classifies by declared media type *and* by extension, because a
 * datasource can report a generic type for a file whose name says otherwise.
 * When the two disagree the more dangerous answer wins.
 */
export type ContentDisposition = "text" | "active" | "binary";

const ACTIVE_MEDIA_TYPES = new Set([
	"application/pdf",
	"application/x-7z-compressed",
	"application/vnd.ms-excel",
	"application/vnd.ms-powerpoint",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/x-tar",
	"application/zip",
	"image/svg+xml",
	"message/rfc822",
	"text/html",
	"text/xml",
	"application/xml",
	"application/xhtml+xml",
]);

const ACTIVE_EXTENSIONS =
	/\.(?:pdf|docx?|xlsx?|pptx?|svg|html?|xhtml|xml|zip|7z|tar|gz|eml|msg|rtf|jar|iso)$/iu;

const TEXT_MEDIA_TYPES = new Set([
	"application/json",
	"application/x-ndjson",
	"application/jsonlines",
	"text/csv",
	"text/markdown",
	"text/plain",
	"text/tab-separated-values",
]);

export function classifyContent(mediaType: string, fileName: string): ContentDisposition {
	const type = mediaType.split(";")[0]?.trim().toLocaleLowerCase() ?? "";

	// Extension wins when it indicates active content: a mislabelled .svg served
	// as text/plain is still active content.
	if (ACTIVE_EXTENSIONS.test(fileName) || ACTIVE_MEDIA_TYPES.has(type)) return "active";
	if (TEXT_MEDIA_TYPES.has(type)) return "text";
	if (type.startsWith("text/")) return "text";
	return "binary";
}

export type FileContent = Readonly<{
	bytes: Uint8Array;
	mediaType: string;
	/** From Content-Disposition when present, else the caller's fallback. */
	fileName: string;
	disposition: ContentDisposition;
}>;

/** Reads the filename from Content-Disposition, rejecting path separators. */
function parseDispositionFileName(header: string | null): string | undefined {
	if (header === null) return undefined;
	const match = /filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/iu.exec(header);
	const raw = match?.[1];
	if (raw === undefined) return undefined;
	let decoded = raw;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		// Not percent-encoded; use it as-is.
	}
	// A server-supplied name is untrusted: strip any path, and refuse traversal.
	const base = decoded.split(/[/\\]/u).pop()?.trim() ?? "";
	if (base === "" || base === "." || base === "..") return undefined;
	return base;
}

/**
 * Fetches the original bytes of a file.
 *
 * This is the most exposing call in the API, so it is deliberately awkward to
 * use by accident: the caller must pass the file name and size it already has,
 * and must decide what to do with the result.
 *
 * The byte cap is enforced **while streaming**, not after. A post-download check
 * cannot prevent memory exhaustion, and `Content-Length` is a claim the server
 * makes rather than a guarantee — so both are checked.
 *
 * Callers must not render the result inline unless `disposition` is `"text"`.
 * See docs/dxr-public-api.md.
 */
export async function getFileContent(
	fileId: string,
	options: Readonly<{
		fileName?: string;
		maxBytes?: number;
		signal?: AbortSignal;
	}> = {},
): Promise<FileContent> {
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_CONTENT_BYTES;
	const timeoutSignal = AbortSignal.timeout(CONTENT_TIMEOUT_MS);
	const combined =
		options.signal === undefined ? timeoutSignal : AbortSignal.any([options.signal, timeoutSignal]);

	let response: Response;
	try {
		response = await fetch(`${API_ROOT}/files/${encodeURIComponent(fileId)}/content`, {
			cache: "no-store",
			credentials: "same-origin",
			headers: { Accept: "*/*" },
			redirect: "error",
			signal: combined,
		});
	} catch {
		if (options.signal?.aborted === true) {
			throw new DxrApiError("aborted", "The download was cancelled.");
		}
		throw new DxrApiError("unavailable", "The file could not be reached.");
	}

	if (!response.ok) throw errorForStatus(response.status);

	const declaredLength = response.headers.get("content-length");
	if (declaredLength !== null && Number(declaredLength) > maxBytes) {
		throw new DxrApiError(
			"unavailable",
			`This file is larger than the ${formatByteLimit(maxBytes)} limit this application will load.`,
		);
	}

	const mediaType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
	const fileName =
		parseDispositionFileName(response.headers.get("content-disposition")) ??
		options.fileName ??
		fileId;

	const chunks: Uint8Array[] = [];
	let total = 0;

	if (response.body === null) {
		return {
			bytes: new Uint8Array(0),
			disposition: classifyContent(mediaType, fileName),
			fileName,
			mediaType,
		};
	}

	const reader = response.body.getReader();
	try {
		while (true) {
			const result = await reader.read();
			if (result.done) break;
			total += result.value.byteLength;
			if (total > maxBytes) {
				await reader.cancel();
				throw new DxrApiError(
					"unavailable",
					`This file exceeded the ${formatByteLimit(maxBytes)} limit while downloading and was abandoned.`,
				);
			}
			chunks.push(result.value);
		}
	} catch (error) {
		if (options.signal?.aborted === true) {
			throw new DxrApiError("aborted", "The download was cancelled.");
		}
		if (error instanceof DxrApiError) throw error;
		throw new DxrApiError("unavailable", "The download failed part-way through.");
	} finally {
		await reader.cancel().catch(() => undefined);
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return { bytes, disposition: classifyContent(mediaType, fileName), fileName, mediaType };
}

function formatByteLimit(bytes: number): string {
	return bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${bytes} bytes`;
}

/**
 * Decodes bytes as UTF-8 for inert text rendering.
 *
 * Strict: invalid UTF-8 throws rather than being silently replaced, because a
 * file full of replacement characters is a sign the caller is about to render
 * something that is not text.
 */
export function decodeUtf8(bytes: Uint8Array): string {
	return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/**
 * Why a file stream stopped.
 *
 * - `complete`: the server ended the stream and every line parsed.
 * - `capped`: this client stopped at `maxRows`. More matches exist.
 * - `interrupted`: the server stopped mid-record, or the connection dropped.
 *   The result is an unknown fraction of the matches and must be presented as
 *   incomplete.
 */
export type ListFilesOutcome = "complete" | "capped" | "interrupted";

export type ListFilesResult = Readonly<{
	rows: readonly FileMetadata[];
	outcome: ListFilesOutcome;
	bytesRead: number;
	/** Lines that were received whole but did not parse. */
	malformedLines: number;
}>;

export type ListFilesOptions = Readonly<{
	query: string;
	maxRows?: number;
	signal?: AbortSignal;
	/** Called for each parsed row, so results can render as they arrive. */
	onRow?: (row: FileMetadata, index: number) => void;
}>;

/**
 * Streams `GET /api/v1/files`, stopping at `maxRows`.
 *
 * Rows are delivered through `onRow` as they parse and also returned in full,
 * so a caller can render progressively without tracking state twice.
 */
export async function listFiles({
	query,
	maxRows = DEFAULT_MAX_ROWS,
	signal,
	onRow,
}: ListFilesOptions): Promise<ListFilesResult> {
	const cap = Math.max(1, Math.min(Math.trunc(maxRows), MAX_ROWS_LIMIT));

	let response: Response;
	try {
		response = await fetch(`${API_ROOT}/files?q=${encodeURIComponent(query)}`, {
			cache: "no-store",
			credentials: "same-origin",
			headers: { Accept: "application/jsonlines, application/json" },
			redirect: "error",
			signal: signal ?? null,
		});
	} catch {
		if (signal?.aborted === true) {
			throw new DxrApiError("aborted", "The search was cancelled.");
		}
		throw new DxrApiError("unavailable", "The API could not be reached.");
	}

	if (!response.ok) throw errorForStatus(response.status);
	if (response.body === null) {
		return { bytesRead: 0, malformedLines: 0, outcome: "complete", rows: [] };
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8");
	const rows: FileMetadata[] = [];
	let buffer = "";
	let bytesRead = 0;
	let malformedLines = 0;
	let outcome: ListFilesOutcome = "complete";

	/** Returns false once the cap is reached. */
	const pushLine = (line: string): boolean => {
		const trimmed = line.trim();
		if (trimmed === "") return true;
		try {
			const row = JSON.parse(trimmed) as FileMetadata;
			// A row without an id cannot be identified, selected, or fetched later.
			if (typeof row.fileId !== "string" || row.fileId === "") {
				malformedLines += 1;
				return true;
			}
			rows.push(row);
			onRow?.(row, rows.length - 1);
		} catch {
			malformedLines += 1;
		}
		return rows.length < cap;
	};

	try {
		let reading = true;
		while (reading) {
			const chunkTimeout = AbortSignal.timeout(CHUNK_TIMEOUT_MS);
			const result = await Promise.race([
				reader.read(),
				new Promise<never>((_resolve, reject) => {
					chunkTimeout.addEventListener("abort", () =>
						reject(new DxrApiError("timeout", "The stream stalled and was abandoned.")),
					);
				}),
			]);

			if (result.done) {
				// A non-empty tail means the server stopped part-way through a record.
				if (buffer.trim() !== "") {
					if (!pushLine(buffer)) {
						outcome = "capped";
					} else if (malformedLines > 0) {
						outcome = "interrupted";
					}
				}
				break;
			}

			bytesRead += result.value.byteLength;
			if (bytesRead > MAX_STREAM_BYTES) {
				outcome = "interrupted";
				break;
			}

			buffer += decoder.decode(result.value, { stream: true });
			let newlineIndex = buffer.indexOf("\n");
			while (newlineIndex !== -1) {
				const line = buffer.slice(0, newlineIndex);
				buffer = buffer.slice(newlineIndex + 1);
				if (!pushLine(line)) {
					outcome = "capped";
					reading = false;
					break;
				}
				newlineIndex = buffer.indexOf("\n");
			}
		}
	} catch (error) {
		if (signal?.aborted === true) {
			throw new DxrApiError("aborted", "The search was cancelled.");
		}
		if (error instanceof DxrApiError && error.kind === "timeout") {
			// Rows already parsed are still usable; report them as incomplete.
			outcome = "interrupted";
		} else {
			outcome = "interrupted";
		}
	} finally {
		// Cancelling releases the connection when we stopped early by choice.
		await reader.cancel().catch(() => undefined);
	}

	return { bytesRead, malformedLines, outcome, rows };
}
