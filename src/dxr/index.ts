/**
 * Data X-Ray public API v1 access layer.
 *
 * Read docs/dxr-public-api.md before extending this: the endpoint set is small
 * and fixed, and the file endpoint's lack of pagination and total count is a
 * constraint to design around, not an oversight to work around.
 */
export {
	type Catalog,
	type CatalogEntry,
	emptyCatalog,
	loadCatalog,
	toCatalog,
} from "./catalog";
export {
	type ContentDisposition,
	classifyContent,
	DEFAULT_MAX_CONTENT_BYTES,
	DEFAULT_MAX_ROWS,
	DxrApiError,
	type DxrErrorKind,
	decodeUtf8,
	type FileContent,
	getClassifications,
	getFileContent,
	getRedactedText,
	getRedactors,
	type ListFilesOutcome,
	type ListFilesResult,
	listFiles,
	MAX_ROWS_LIMIT,
} from "./client";
export {
	COMPARABLE_FIELDS,
	compileQuery,
	emptyFilterModel,
	type FilterModel,
	isMatchAll,
	MATCH_ALL_QUERY,
	quoteValue,
	toFullDateTime,
	validateQuery,
} from "./kql";
export type * from "./types";
