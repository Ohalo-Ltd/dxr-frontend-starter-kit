/**
 * Development proxy for the Data X-Ray public API.
 *
 * Why this exists: the API authenticates with a long-lived Bearer token and
 * publishes no CORS headers. A browser therefore cannot — and must not — call it
 * directly. This middleware is the same-origin hop that holds the credential, so
 * the application code only ever fetches relative `/api/v1/...` paths and
 * `connect-src 'self'` stays intact.
 *
 * It applies for `vite dev` and `vite preview` only, and refuses to participate
 * in a production build. FOR PRODUCTION YOU MUST SUPPLY YOUR OWN BACKEND: this
 * file is not hardened for untrusted callers, performs no user authentication,
 * and applies no per-user authorization. See docs/api-authentication.md.
 *
 * Modes:
 * - No `DXR_API_TOKEN`: fixture mode, served from `fixtures/`. Runs offline.
 * - `DXR_API_URL` + `DXR_API_TOKEN`: live mode against a real instance.
 */

import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { compileFixturePredicate, QueryError } from "./fixtureQuery.mjs";

const fixturesDirectory = new URL("../fixtures/", import.meta.url);

/**
 * Exactly the endpoints the published v1 specification defines. Anything else is
 * refused rather than forwarded, so a mistake in application code cannot reach an
 * unintended upstream path.
 */
const ALLOWED_PATHS = [
	/^\/api\/v1\/files$/u,
	/^\/api\/v1\/files\/[^/]+\/content$/u,
	/^\/api\/v1\/files\/[^/]+\/redacted-text$/u,
	/^\/api\/v1\/classifications$/u,
	/^\/api\/v1\/redactors$/u,
];

/** Rows streamed before a match-all query is cut off, mirroring live truncation. */
const FIXTURE_TRUNCATE_AFTER = 8;
const UPSTREAM_TIMEOUT_MS = 120_000;

function sendJson(response, status, body) {
	const payload = JSON.stringify(body);
	response.writeHead(status, {
		"cache-control": "no-store",
		"content-type": "application/json",
	});
	response.end(payload);
}

function sendApiError(response, status, message) {
	sendJson(response, status, { status: "error", error: { message } });
}

/* Fixture mode ------------------------------------------------------------- */

async function serveFixtureJson(response, name) {
	try {
		const body = await readFile(new URL(name, fixturesDirectory), "utf8");
		response.writeHead(200, {
			"cache-control": "no-store",
			"content-type": "application/json",
		});
		response.end(body);
	} catch {
		sendApiError(response, 500, `Fixture ${name} is missing or unreadable.`);
	}
}

/** Finds one fixture row by id, for the content endpoints. */
async function findFixtureRow(fileId) {
	const lines = createInterface({
		input: createReadStream(new URL("files.jsonl", fixturesDirectory)),
		crlfDelay: Number.POSITIVE_INFINITY,
	});
	try {
		for await (const line of lines) {
			if (line.trim() === "") continue;
			try {
				const row = JSON.parse(line);
				if (row.fileId === fileId) return row;
			} catch {
				// Skip an unparseable fixture line.
			}
		}
	} finally {
		lines.close();
	}
	return undefined;
}

/**
 * Reads a content fixture.
 *
 * `fileId` is used as a file name, so it is validated against a strict pattern
 * first. Without that check a crafted id could escape the fixtures directory.
 */
async function readContentFixture(fileId) {
	if (!/^[A-Za-z0-9_-]{1,128}$/u.test(fileId)) return undefined;
	try {
		return await readFile(new URL(`content/${fileId}.txt`, fixturesDirectory));
	} catch {
		return undefined;
	}
}

/** A minimal, valid PDF, so the active-content path is exercisable offline. */
function syntheticPdf(title) {
	const text = title.replace(/[()\\]/gu, "");
	const body = `1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 90>>stream
BT /F1 11 Tf 20 70 Td (${text}) Tj 0 -18 Td (synthetic fixture) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
`;
	return Buffer.from(`%PDF-1.4\n${body}trailer<</Root 1 0 R>>\n%%EOF\n`, "latin1");
}

/**
 * Serves `GET /api/v1/files/{id}/content` from fixtures.
 *
 * Text fixtures live in `fixtures/content/<fileId>.txt`. A PDF row with no text
 * fixture gets a generated PDF so the download-only path can be demonstrated
 * without committing a binary.
 */
async function serveFixtureContent(response, fileId) {
	const row = await findFixtureRow(fileId);
	if (row === undefined) {
		sendApiError(response, 404, "No such file.");
		return;
	}

	const text = await readContentFixture(fileId);
	const body =
		text ?? (row.mimeType === "application/pdf" ? syntheticPdf(row.fileName) : undefined);

	if (body === undefined) {
		// A real instance can also hold a file it cannot return bytes for.
		sendApiError(response, 404, "No content fixture exists for this file.");
		return;
	}

	response.writeHead(200, {
		"cache-control": "no-store",
		"content-disposition": `attachment; filename="${row.fileName.replace(/["\\]/gu, "")}"`,
		"content-length": String(body.byteLength),
		"content-type": row.mimeType ?? "application/octet-stream",
	});
	response.end(body);
}

/**
 * Serves `GET /api/v1/files/{id}/redacted-text` from fixtures.
 *
 * Masking here is a crude stand-in for the real redactors — enough to show the
 * difference between a redacted and an original view. Do not read it as the
 * redaction behaviour of a live instance.
 */
async function serveFixtureRedactedText(response, fileId, redactorId) {
	const row = await findFixtureRow(fileId);
	if (row === undefined) {
		sendApiError(response, 404, "No such file.");
		return;
	}

	const text = await readContentFixture(fileId);
	// An empty result is a normal outcome: discovery-only scans, unsupported
	// formats, and image-only PDFs all produce no extractable text.
	let redactedText = "";
	if (text !== undefined) {
		redactedText = text
			.toString("utf8")
			.replace(/[\w.+-]+@[\w.-]+\.\w{2,}/gu, "[REDACTED EMAIL]")
			.replace(/\b\d{3}-\d{2}-\d{4}\b/gu, "[REDACTED ID]")
			.replace(/\b0\d{3}\s?\d{6}\b/gu, "[REDACTED PHONE]");
		// Redactor 2 in the fixtures is "Financial data only", so it leaves
		// identifiers alone and only masks the account-shaped values.
		if (redactorId === 2) {
			redactedText = text.toString("utf8").replace(/\b\d{3}-\d{2}-\d{4}\b/gu, "[REDACTED ID]");
		}
	}

	sendJson(response, 200, { status: "ok", data: { redactedText } });
}

/**
 * Streams matching fixture rows as JSONL.
 *
 * A match-all query is deliberately truncated part-way through a record. That is
 * not a bug in the fixture: it is how the live API behaves when a broad query
 * exceeds its response budget, and the UI has to handle it.
 */
async function serveFixtureFiles(response, query) {
	let predicate;
	try {
		predicate = compileFixturePredicate(query);
	} catch (error) {
		if (error instanceof QueryError) {
			sendApiError(response, 400, error.message);
			return;
		}
		sendApiError(response, 400, "The query could not be parsed.");
		return;
	}

	const isMatchAll = query.trim() === 'fileName:"*"';
	response.writeHead(200, {
		"cache-control": "no-store",
		"content-type": "application/jsonlines",
	});

	const lines = createInterface({
		input: createReadStream(new URL("files.jsonl", fixturesDirectory)),
		crlfDelay: Number.POSITIVE_INFINITY,
	});

	let emitted = 0;
	try {
		for await (const line of lines) {
			if (line.trim() === "") continue;
			let row;
			try {
				row = JSON.parse(line);
			} catch {
				continue;
			}
			if (!predicate(row)) continue;

			if (isMatchAll && emitted === FIXTURE_TRUNCATE_AFTER) {
				// Cut mid-record, exactly as an interrupted upstream stream would.
				response.write(`${JSON.stringify(row).slice(0, 60)}`);
				lines.close();
				response.end();
				return;
			}

			response.write(`${JSON.stringify(row)}\n`);
			emitted += 1;
			// A small delay makes progressive rendering observable in development.
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	} catch {
		// Fall through: whatever was already written stays a valid partial stream.
	}
	response.end();
}

/* Live mode ---------------------------------------------------------------- */

async function forwardToUpstream(request, response, { baseUrl, token }) {
	const target = new URL(`${request.url}`, baseUrl);
	// Pin the host: a crafted path can never redirect this to another origin.
	if (target.host !== new URL(baseUrl).host) {
		sendApiError(response, 400, "Refusing to forward to a different host.");
		return;
	}

	let upstream;
	try {
		upstream = await fetch(target, {
			headers: {
				accept: request.headers.accept ?? "application/json",
				// The credential is attached here and nowhere else. It is never
				// written to a log, an error body, or a response header.
				authorization: `Bearer ${token}`,
			},
			method: "GET",
			redirect: "error",
			signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
		});
	} catch {
		sendApiError(response, 502, "The upstream API could not be reached.");
		return;
	}

	const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
	const headers = { "cache-control": "no-store", "content-type": contentType };
	const disposition = upstream.headers.get("content-disposition");
	if (disposition !== null) headers["content-disposition"] = disposition;

	response.writeHead(upstream.status, headers);

	if (upstream.body === null) {
		response.end();
		return;
	}

	// Stream through unbuffered so the browser can parse rows as they arrive.
	try {
		for await (const chunk of upstream.body) {
			response.write(chunk);
		}
	} catch {
		// An upstream cut mid-stream reaches the client as a truncated body, which
		// is precisely the condition the client is built to detect.
	}
	response.end();
}

/* Plugin ------------------------------------------------------------------- */

/**
 * Loads `.env` into `process.env` without overwriting anything already set, so
 * an explicit `export` or a CI variable always beats the file on disk.
 *
 * `.env` is gitignored. Never commit one: it holds a real API token.
 */
function loadEnvFile() {
	const before = new Set(Object.keys(process.env));
	const previous = { ...process.env };
	try {
		process.loadEnvFile();
	} catch {
		// No .env file, which is the normal case for fixture mode.
		return;
	}
	for (const key of before) {
		process.env[key] = previous[key];
	}
}

function readConfiguration() {
	loadEnvFile();
	const rawBaseUrl = process.env.DXR_API_URL?.trim().replace(/\/+$/u, "") ?? "";
	const token = process.env.DXR_API_TOKEN?.trim() ?? "";
	const allowSelfSignedTls = process.env.DXR_ALLOW_SELF_SIGNED_TLS === "true";

	if (token === "") return { mode: "fixture" };
	if (rawBaseUrl === "") {
		return { mode: "misconfigured", reason: "DXR_API_TOKEN is set but DXR_API_URL is not." };
	}
	try {
		new URL(rawBaseUrl);
	} catch {
		return { mode: "misconfigured", reason: "DXR_API_URL is not a valid URL." };
	}

	return { allowSelfSignedTls, baseUrl: rawBaseUrl, mode: "live", token };
}

function createMiddleware(configuration) {
	return (request, response, next) => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		if (!url.pathname.startsWith("/api/")) {
			next();
			return;
		}
		if (!ALLOWED_PATHS.some((pattern) => pattern.test(url.pathname))) {
			sendApiError(response, 404, "Not a Data X-Ray v1 endpoint.");
			return;
		}
		if (request.method !== "GET") {
			sendApiError(response, 405, "The v1 API is read-only.");
			return;
		}

		if (configuration.mode === "misconfigured") {
			sendApiError(response, 500, configuration.reason);
			return;
		}

		if (configuration.mode === "live") {
			forwardToUpstream(request, response, configuration).catch(() => {
				if (!response.headersSent) sendApiError(response, 502, "Upstream request failed.");
			});
			return;
		}

		if (url.pathname === "/api/v1/classifications") {
			serveFixtureJson(response, "classifications.json").catch(() => undefined);
			return;
		}
		if (url.pathname === "/api/v1/redactors") {
			serveFixtureJson(response, "redactors.json").catch(() => undefined);
			return;
		}
		if (url.pathname === "/api/v1/files") {
			serveFixtureFiles(response, url.searchParams.get("q") ?? "").catch(() => undefined);
			return;
		}

		const contentMatch = /^\/api\/v1\/files\/([^/]+)\/content$/u.exec(url.pathname);
		if (contentMatch !== null) {
			serveFixtureContent(response, decodeURIComponent(contentMatch[1])).catch(() => {
				if (!response.headersSent) sendApiError(response, 500, "Fixture content failed.");
			});
			return;
		}

		const redactedMatch = /^\/api\/v1\/files\/([^/]+)\/redacted-text$/u.exec(url.pathname);
		if (redactedMatch !== null) {
			const redactorId = Number(url.searchParams.get("redactor_id"));
			if (!Number.isInteger(redactorId)) {
				sendApiError(response, 400, "redactor_id is required and must be an integer.");
				return;
			}
			serveFixtureRedactedText(response, decodeURIComponent(redactedMatch[1]), redactorId).catch(
				() => {
					if (!response.headersSent) sendApiError(response, 500, "Fixture redaction failed.");
				},
			);
			return;
		}

		sendApiError(response, 404, "Not a Data X-Ray v1 endpoint.");
	};
}

/** Vite plugin. Active for `dev` and `preview`; inert for `build`. */
export function dxrProxy() {
	const configuration = readConfiguration();

	const announce = (logger) => {
		if (configuration.mode === "fixture") {
			logger.info(
				"[dxr] fixture mode — serving fixtures/. Set DXR_API_URL and DXR_API_TOKEN for a live instance.",
			);
		} else if (configuration.mode === "live") {
			// The URL is safe to print. The token never is.
			logger.info(`[dxr] live mode — proxying /api/v1/* to ${configuration.baseUrl}`);
			if (configuration.allowSelfSignedTls) {
				// Some demo instances present a self-signed certificate. A browser can
				// never opt out of verification; this Node-side escape hatch is the
				// only reason such an instance is reachable at all. Development only —
				// it disables verification for every TLS connection this process makes.
				process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
				logger.warn(
					"[dxr] TLS certificate verification is DISABLED for this dev server. Never do this outside local development.",
				);
			}
		} else {
			logger.error(`[dxr] ${configuration.reason}`);
		}
	};

	return {
		name: "dxr-api-dev-proxy",
		apply: (_config, env) => env.command === "serve",
		configureServer(server) {
			announce(server.config.logger);
			server.middlewares.use(createMiddleware(configuration));
		},
		configurePreviewServer(server) {
			announce(server.config.logger);
			server.middlewares.use(createMiddleware(configuration));
		},
	};
}

export const __testing = { ALLOWED_PATHS, fixturesDirectory: fileURLToPath(fixturesDirectory) };
