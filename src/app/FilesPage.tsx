import { useCallback, useEffect, useRef, useState } from "react";
import { FileDetailPanel } from "../components/files/FileDetailPanel";
import { FilesResultsTable } from "../components/files/FilesResultsTable";
import { FilterBuilder } from "../components/filters/FilterBuilder";
import { QueryView } from "../components/filters/QueryView";
import {
	type Catalog,
	compileQuery,
	DEFAULT_MAX_ROWS,
	DxrApiError,
	emptyCatalog,
	emptyFilterModel,
	type FileMetadata,
	type FilterModel,
	isMatchAll,
	type ListFilesOutcome,
	listFiles,
	loadCatalog,
} from "../dxr";
import { Button, LoadingBar, Notice } from "../ui";

type SearchState =
	| { readonly kind: "idle" }
	| { readonly kind: "streaming" }
	| {
			readonly kind: "done";
			readonly outcome: ListFilesOutcome;
			readonly malformedLines: number;
	  }
	| { readonly kind: "error"; readonly error: DxrApiError };

/**
 * Search files by what is inside them.
 *
 * This page is the worked example for the kit: it loads the classification
 * catalog, compiles a filter model into a query, streams the response with a
 * hard row cap, and reports the three outcomes the API can produce — complete,
 * capped by this client, and truncated by the server.
 *
 * Delete or rewrite it for a real module. What is worth keeping is the shape:
 * one explicit query model, bounded work, cancellation on every new search, and
 * distinct states for every outcome.
 */
export function FilesPage() {
	const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
	const [catalogError, setCatalogError] = useState<string | undefined>(undefined);
	const [catalogLoading, setCatalogLoading] = useState(true);

	const [draft, setDraft] = useState<FilterModel>(emptyFilterModel);
	const [appliedModel, setAppliedModel] = useState<FilterModel>(emptyFilterModel);
	const [rawQuery, setRawQuery] = useState<string | undefined>(undefined);

	const [rows, setRows] = useState<readonly FileMetadata[]>([]);
	const [search, setSearch] = useState<SearchState>({ kind: "idle" });
	const [selected, setSelected] = useState<FileMetadata | undefined>(undefined);
	const [maxRows, setMaxRows] = useState(DEFAULT_MAX_ROWS);

	// One in-flight search at a time. A newer query always cancels the older one,
	// so a slow earlier response can never overwrite newer results.
	const inFlight = useRef<AbortController | undefined>(undefined);

	const draftQuery = compileQuery(draft);
	const appliedQuery = rawQuery ?? compileQuery(appliedModel);
	const dirty = rawQuery === undefined && draftQuery !== appliedQuery;

	useEffect(() => {
		const controller = new AbortController();
		loadCatalog(controller.signal)
			.then((loaded) => {
				setCatalog(loaded);
				setCatalogLoading(false);
			})
			.catch((error: unknown) => {
				if (error instanceof DxrApiError && error.kind === "aborted") return;
				setCatalogError(
					error instanceof DxrApiError
						? error.message
						: "The classification catalog could not be loaded.",
				);
				setCatalogLoading(false);
			});
		return () => controller.abort();
	}, []);

	useEffect(() => {
		// Abandon any in-flight stream when the page unmounts.
		return () => inFlight.current?.abort();
	}, []);

	const runSearch = useCallback((query: string, rowCap: number) => {
		inFlight.current?.abort();
		const controller = new AbortController();
		inFlight.current = controller;

		setRows([]);
		setSelected(undefined);
		setSearch({ kind: "streaming" });

		// Rows are collected here and flushed in batches: a setState per row
		// would re-render the table hundreds of times during one stream.
		let pending: FileMetadata[] = [];
		let flushHandle: ReturnType<typeof setTimeout> | undefined;
		const flush = () => {
			flushHandle = undefined;
			if (pending.length === 0) return;
			const batch = pending;
			pending = [];
			setRows((current) => [...current, ...batch]);
		};

		listFiles({
			maxRows: rowCap,
			onRow: (row) => {
				pending.push(row);
				if (flushHandle === undefined) {
					flushHandle = globalThis.setTimeout(flush, 60);
				}
			},
			query,
			signal: controller.signal,
		})
			.then((result) => {
				if (controller.signal.aborted) return;
				if (flushHandle !== undefined) globalThis.clearTimeout(flushHandle);
				flush();
				setSearch({
					kind: "done",
					malformedLines: result.malformedLines,
					outcome: result.outcome,
				});
			})
			.catch((error: unknown) => {
				if (flushHandle !== undefined) globalThis.clearTimeout(flushHandle);
				if (error instanceof DxrApiError && error.kind === "aborted") return;
				setSearch({
					error:
						error instanceof DxrApiError
							? error
							: new DxrApiError("unavailable", "The search could not be completed."),
					kind: "error",
				});
			});
	}, []);

	function applyFilters() {
		setRawQuery(undefined);
		setAppliedModel(draft);
		runSearch(compileQuery(draft), maxRows);
	}

	function resetFilters() {
		inFlight.current?.abort();
		setDraft(emptyFilterModel);
		setAppliedModel(emptyFilterModel);
		setRawQuery(undefined);
		setRows([]);
		setSelected(undefined);
		setSearch({ kind: "idle" });
	}

	function submitRawQuery(query: string) {
		setRawQuery(query);
		runSearch(query, maxRows);
	}

	function clearRawQuery() {
		setRawQuery(undefined);
		runSearch(compileQuery(draft), maxRows);
	}

	const busy = search.kind === "streaming";
	const unbounded = rawQuery === undefined && isMatchAll(draft);

	return (
		<div className="files-page">
			<header className="files-page__header">
				<p className="eyebrow">Files</p>
				<h1>Search by what is inside the file</h1>
				<p>
					Data X-Ray classifies file contents, so filtering on an annotator, domain, or label finds
					records regardless of what they are called. The filters below are built from this
					instance's own classification catalog.
				</p>
			</header>

			{catalogError !== undefined && (
				<Notice tone="danger" title="Classification catalog unavailable" live="alert">
					<p>
						{catalogError} Filtering by sensitive data, domain, label, or extractor is unavailable
						until it loads. File attribute filters still work.
					</p>
				</Notice>
			)}

			{catalogLoading ? (
				<div>
					<LoadingBar label="Loading the classification catalog" />
					<p className="status-text" role="status">
						Loading the classification catalog…
					</p>
				</div>
			) : (
				<FilterBuilder
					catalog={catalog}
					draft={draft}
					onDraftChange={setDraft}
					onApply={applyFilters}
					onReset={resetFilters}
					busy={busy}
					dirty={dirty}
				/>
			)}

			<QueryView
				compiledQuery={draftQuery}
				rawQuery={rawQuery}
				onRawQuerySubmit={submitRawQuery}
				onRawQueryClear={clearRawQuery}
				busy={busy}
			/>

			{unbounded && search.kind === "idle" && (
				<Notice tone="warning" title="No filters selected">
					<p>
						Searching now sends <code>{draftQuery}</code>, which matches every indexed file. On a
						real corpus the server will truncate that response part-way through. Add a filter to get
						a result you can trust.
					</p>
				</Notice>
			)}

			<section className="results" aria-label="Results">
				<div className="results__header">
					<div>
						<p className="results__count">
							{search.kind === "idle"
								? "No search run yet"
								: `${rows.length} ${rows.length === 1 ? "file" : "files"}`}
						</p>
						{search.kind !== "idle" && (
							<p className="results__qualifier">
								This is the number of rows read, not a total. The v1 API reports no match count.
							</p>
						)}
					</div>
					{busy && (
						<Button kind="secondary" size="sm" onClick={() => inFlight.current?.abort()}>
							Stop
						</Button>
					)}
				</div>

				{busy && <LoadingBar label="Streaming results" />}

				{search.kind === "error" && (
					<Notice
						tone="danger"
						title={
							search.error.kind === "invalid-query"
								? "The query was rejected"
								: search.error.kind === "denied"
									? "Access denied"
									: search.error.kind === "timeout"
										? "The server timed out"
										: "The API is unavailable"
						}
						live="alert"
						actions={
							<Button kind="secondary" size="sm" onClick={() => runSearch(appliedQuery, maxRows)}>
								Try again
							</Button>
						}
					>
						<p>{search.error.message}</p>
					</Notice>
				)}

				{search.kind === "done" && search.outcome === "interrupted" && (
					<Notice tone="warning" title="These results are incomplete" live="status">
						<p>
							The server stopped sending results part-way through. What is shown is an unknown
							fraction of the matches — do not read the count as a total. Narrow the filter and
							search again.
						</p>
					</Notice>
				)}

				{search.kind === "done" && search.outcome === "capped" && (
					<Notice tone="info" title={`Stopped at ${maxRows} rows`} live="status">
						<p>
							More files match. This client stops reading at its row cap because the API offers no
							pagination. Narrow the filter, or raise the cap.
						</p>
						{maxRows < 500 && (
							<div className="notice__actions">
								<Button
									kind="secondary"
									size="sm"
									onClick={() => {
										setMaxRows(500);
										runSearch(appliedQuery, 500);
									}}
								>
									Read up to 500
								</Button>
							</div>
						)}
					</Notice>
				)}

				{search.kind === "done" && search.malformedLines > 0 && (
					<Notice tone="warning" title="Some records could not be read">
						<p>
							{search.malformedLines === 1
								? "1 record was skipped because it did not parse or carried no file identifier."
								: `${search.malformedLines} records were skipped because they did not parse or carried no file identifier.`}
						</p>
					</Notice>
				)}

				<FilesResultsTable
					files={rows}
					selectedFileId={selected?.fileId}
					onFileSelect={setSelected}
					caption={
						search.kind === "idle"
							? "Apply a filter to search."
							: `${rows.length} rows read for ${appliedQuery}`
					}
					emptyMessage={
						search.kind === "idle"
							? "No search has been run."
							: busy
								? "Waiting for the first result…"
								: "No files matched this query."
					}
				/>
			</section>

			{/* Keyed by file id so selecting a different row remounts the panel,
			    resetting its tab without a synchronising effect. */}
			{selected !== undefined && (
				<FileDetailPanel
					key={selected.fileId}
					file={selected}
					onClose={() => setSelected(undefined)}
				/>
			)}
		</div>
	);
}
