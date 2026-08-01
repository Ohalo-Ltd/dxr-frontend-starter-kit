import { useCallback, useEffect, useRef, useState } from "react";
import {
	classifyContent,
	DxrApiError,
	decodeUtf8,
	type FileMetadata,
	getFileContent,
	getRedactedText,
	getRedactors,
	type Redactor,
} from "../../dxr";
import { Button, LoadingBar, Notice, Select } from "../../ui";
import { formatBytes } from "./FilesResultsTable";

/**
 * Beyond this, text is shown truncated rather than handed to the DOM whole.
 * A very large string in a single node is a browser-hang risk.
 */
const MAX_RENDERED_CHARACTERS = 200_000;

type Loaded =
	| { readonly kind: "idle" }
	| { readonly kind: "loading"; readonly what: string }
	| { readonly kind: "text"; readonly text: string; readonly redacted: boolean }
	| { readonly kind: "error"; readonly message: string };

type FileContentTabProps = Readonly<{
	file: FileMetadata;
}>;

/**
 * Reading a file's content, as three separate and increasingly exposing steps.
 *
 * Nothing here runs automatically. Opening a file shows only what the search
 * already returned; every byte of content costs a deliberate click:
 *
 * 1. **Redacted text** — the default, and the only one offered first. Sensitive
 *    values are masked by a server-side redactor.
 * 2. **Original text** — unredacted, offered only for content classified as
 *    text, rendered as inert React text.
 * 3. **Download original** — the raw bytes, for anything else. Never rendered.
 *
 * Active formats (PDF, Office, SVG, HTML, archives) are never displayed inline
 * whatever their declared media type says. They carry scripting or a complex
 * parser, and a sandbox for them is a separate, reviewed decision — see
 * docs/dxr-public-api.md.
 */
export function FileContentTab({ file }: FileContentTabProps) {
	const [redactors, setRedactors] = useState<readonly Redactor[]>([]);
	const [redactorId, setRedactorId] = useState<number | undefined>(undefined);
	const [redactorsError, setRedactorsError] = useState(false);
	const [loaded, setLoaded] = useState<Loaded>({ kind: "idle" });
	const inFlight = useRef<AbortController | undefined>(undefined);

	const disposition = classifyContent(file.mimeType ?? "", file.fileName);
	const notScanned = file.scanDepth === "DISCOVERY";

	// Only the redactor list loads without user intent. It is metadata about the
	// instance, not file content.
	useEffect(() => {
		const controller = new AbortController();
		getRedactors(controller.signal)
			.then((list) => {
				setRedactors(list);
				setRedactorId(list[0]?.id);
			})
			.catch((error: unknown) => {
				if (error instanceof DxrApiError && error.kind === "aborted") return;
				setRedactorsError(true);
			});
		return () => controller.abort();
	}, []);

	useEffect(() => () => inFlight.current?.abort(), []);

	const run = useCallback(async (what: string, task: (signal: AbortSignal) => Promise<Loaded>) => {
		inFlight.current?.abort();
		const controller = new AbortController();
		inFlight.current = controller;
		setLoaded({ kind: "loading", what });
		try {
			const next = await task(controller.signal);
			if (!controller.signal.aborted) setLoaded(next);
		} catch (error: unknown) {
			if (error instanceof DxrApiError && error.kind === "aborted") return;
			setLoaded({
				kind: "error",
				message: error instanceof DxrApiError ? error.message : "The content could not be loaded.",
			});
		}
	}, []);

	function loadRedacted() {
		if (redactorId === undefined) return;
		void run("redacted text", async (signal) => ({
			kind: "text",
			redacted: true,
			text: await getRedactedText(file.fileId, redactorId, signal),
		}));
	}

	function loadOriginalText() {
		void run("the original text", async (signal) => {
			const content = await getFileContent(file.fileId, {
				fileName: file.fileName,
				signal,
			});
			// Re-check against the response, not the search metadata: the server's
			// declared type is the more reliable of the two.
			if (content.disposition !== "text") {
				return {
					kind: "error",
					message:
						"The server returned this file as a type that must not be rendered inline. Download it instead.",
				};
			}
			try {
				return { kind: "text", redacted: false, text: decodeUtf8(content.bytes) };
			} catch {
				return {
					kind: "error",
					message: "This file is not valid UTF-8 text, so it cannot be shown. Download it instead.",
				};
			}
		});
	}

	function downloadOriginal() {
		void run("the original file", async (signal) => {
			const content = await getFileContent(file.fileId, {
				fileName: file.fileName,
				signal,
			});
			// A Blob URL keeps the bytes out of the document: nothing is parsed or
			// rendered, the browser just writes them to disk.
			const url = URL.createObjectURL(
				new Blob([content.bytes as BlobPart], { type: "application/octet-stream" }),
			);
			try {
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = content.fileName;
				anchor.rel = "noopener";
				document.body.append(anchor);
				anchor.click();
				anchor.remove();
			} finally {
				URL.revokeObjectURL(url);
			}
			return { kind: "idle" };
		});
	}

	const busy = loaded.kind === "loading";

	return (
		<div className="detail-panel__sections">
			<section>
				<h3>Content</h3>
				<p className="detail-panel__permission">
					Nothing below is fetched until you ask for it. Metadata read, content read, and export are
					separate permissions — the server authorises each one, whatever this panel offers.
				</p>

				{notScanned && (
					<Notice tone="info" title="Discovery-only scan">
						<p>
							This file was catalogued but never classified, so redaction has nothing to work from.
							Redacted text will come back empty.
						</p>
					</Notice>
				)}

				<dl className="detail-panel__metadata">
					<div>
						<dt>Type</dt>
						<dd>{file.mimeType ?? "unknown"}</dd>
					</div>
					<div>
						<dt>Size</dt>
						<dd>{formatBytes(file.size)}</dd>
					</div>
				</dl>
			</section>

			<section>
				<h3>Redacted text</h3>
				{redactorsError ? (
					<Notice tone="warning" title="Redactors unavailable">
						<p>The redaction profiles could not be loaded, so redacted text cannot be requested.</p>
					</Notice>
				) : redactors.length === 0 ? (
					<p className="detail-panel__empty">This instance reports no redaction profiles.</p>
				) : (
					<div className="content-actions">
						<Select
							label="Redaction profile"
							value={redactorId === undefined ? "" : String(redactorId)}
							onChange={(event) => setRedactorId(Number(event.target.value))}
						>
							{redactors.map((redactor) => (
								<option key={redactor.id} value={redactor.id}>
									{redactor.name}
								</option>
							))}
						</Select>
						<Button kind="primary" onClick={loadRedacted} disabled={busy}>
							Load redacted text
						</Button>
					</div>
				)}
			</section>

			<section>
				<h3>Original file</h3>
				{disposition === "active" ? (
					<Notice tone="warning" title="This format is never shown inline">
						<p>
							{file.mimeType ?? "This type"} can carry scripts or needs a complex parser, so this
							application will not render it. Downloading opens it in whatever handles it on your
							machine — with none of this application's protections.
						</p>
					</Notice>
				) : (
					<p className="detail-panel__permission">
						The original is unredacted. Every sensitive value the classifiers found is present in
						full.
					</p>
				)}

				<div className="content-actions">
					{disposition === "text" && (
						<Button kind="secondary" onClick={loadOriginalText} disabled={busy}>
							View original text
						</Button>
					)}
					<Button kind="secondary" icon="file" onClick={downloadOriginal} disabled={busy}>
						Download original
					</Button>
					{busy && (
						<Button kind="ghost" onClick={() => inFlight.current?.abort()}>
							Cancel
						</Button>
					)}
				</div>
			</section>

			{loaded.kind === "loading" && (
				<section>
					<LoadingBar label={`Loading ${loaded.what}`} />
					<p className="status-text" role="status">
						Loading {loaded.what}…
					</p>
				</section>
			)}

			{loaded.kind === "error" && (
				<Notice tone="danger" title="Could not load content" live="alert">
					<p>{loaded.message}</p>
				</Notice>
			)}

			{loaded.kind === "text" && (
				<section>
					<h3>{loaded.redacted ? "Redacted text" : "Original text"}</h3>
					{!loaded.redacted && (
						<Notice tone="warning" title="Unredacted">
							<p>This is the file's original text, with nothing masked.</p>
						</Notice>
					)}
					{loaded.text === "" ? (
						<p className="detail-panel__empty">
							No text was returned. That is normal for a discovery-only scan, an unsupported format,
							or a document with no extractable text such as a scanned image.
						</p>
					) : (
						<>
							{loaded.text.length > MAX_RENDERED_CHARACTERS && (
								<p className="status-text">
									Showing the first {MAX_RENDERED_CHARACTERS.toLocaleString()} characters of{" "}
									{loaded.text.length.toLocaleString()}.
								</p>
							)}
							{/* Inert text. React escapes this; it is never markup. */}
							<pre className="detail-panel__text">
								{loaded.text.slice(0, MAX_RENDERED_CHARACTERS)}
							</pre>
						</>
					)}
				</section>
			)}
		</div>
	);
}
