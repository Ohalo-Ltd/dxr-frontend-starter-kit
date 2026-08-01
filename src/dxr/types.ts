/**
 * Types for the Data X-Ray external API, version 1.
 *
 * Hand-written from the published OpenAPI 3.1 document rather than generated,
 * so the kit carries no codegen dependency and the shapes stay readable. When
 * the API changes, update this file against the spec — do not infer shapes from
 * observed responses alone.
 *
 * Only fields the specification marks required are non-optional here. Treat
 * every optional field as genuinely absent for some files: a discovery-only
 * scan produces no annotators, and many connectors supply no owner.
 */

export type ConnectorType =
	| "AMAZON_S3"
	| "AZURE_BLOB_STORAGE"
	| "BOX"
	| "CONTENT_SUITE"
	| "FILE_UPLOAD"
	| "FOLDER_PATH"
	| "GOOGLE_CLOUD_STORAGE"
	| "GOOGLE_DRIVE_GOOGLE_WORKSPACE"
	| "GOOGLE_SHARED_DRIVE_GOOGLE_WORKSPACE"
	| "NETWORK_DRIVE_SMB"
	| "NETWORK_DRIVE_SMB_LEGACY"
	| "NETWORK_DRIVE_SSH"
	| "ON_DEMAND_CLASSIFIER"
	| "ONEDRIVE_GRAPH_API"
	| "SHAREPOINT_2016_2019_REST_API"
	| "SHAREPOINT_ONLINE_GRAPH_API";

/**
 * Connector detail varies by type. The extra identifiers are optional here
 * because a single reader should not have to narrow the union before showing a
 * connector name.
 */
export type ConnectorInfo = Readonly<{
	type: ConnectorType;
	userId?: string;
	siteId?: string;
	siteUrl?: string;
}>;

export type DatasourceInfo = Readonly<{
	id: string;
	name: string;
	connector: ConnectorInfo;
}>;

export type Label = Readonly<{
	id: string;
	name: string;
}>;

export type DlpLabel = Readonly<{
	id: string;
	dlpSystem: "PURVIEW";
	name?: string;
	type: "APPLIED" | "ASSIGNED";
}>;

export type ExtractedMetadata = Readonly<{
	id: string;
	name: string;
	value?: string | number | boolean;
	type: "TEXT" | "NUMBER" | "BOOLEAN";
}>;

export type AnnotatorDomain = Readonly<{
	id: string;
	name: string;
}>;

export type AnnotationLocation = Readonly<{
	start?: number;
	end?: number;
}>;

export type Annotation = Readonly<{
	phrase: string;
	locations: readonly AnnotationLocation[];
}>;

/**
 * A classification hit on a file. `uniquePhrases` is the count of distinct
 * matched phrases and is the only numeric annotator field the query language
 * can compare against.
 */
export type Annotator = Readonly<{
	id: string;
	name: string;
	domain: AnnotatorDomain;
	uniquePhrases: number;
	annotations: readonly Annotation[];
}>;

/** An account that appears in entitlements, ownership, or modification records. */
export type RealmAccount = Readonly<{
	id: string;
	accountType: string;
	realmAccountId: string;
	realmKey: string;
	accountSubType: string;
	name?: string;
	email?: string;
}>;

export type Coordinates = Readonly<{
	lat: number;
	lon: number;
	mapDatum: string;
	alt?: number;
	altRef?: string;
}>;

export type ScanDepth = "DISCOVERY" | "DISCOVERY_AND_CLASSIFICATION";

/** One line of the `GET /api/v1/files` JSONL stream. */
export type FileMetadata = Readonly<{
	datasource: DatasourceInfo;
	fileName: string;
	fileId: string;
	size: number;
	labels: readonly Label[];
	entitlements: Readonly<{ whoCanAccess: readonly RealmAccount[] }>;
	path?: string;
	mimeType?: string;
	createdAt?: string;
	lastModifiedAt?: string;
	contentSha256?: string;
	scanDepth?: ScanDepth;
	metadataExtractionStatus?: string;
	extractedMetadata?: readonly ExtractedMetadata[];
	dlpLabels?: readonly DlpLabel[];
	annotators?: readonly Annotator[];
	owner?: RealmAccount;
	createdBy?: RealmAccount;
	modifiedBy?: RealmAccount;
	coordinates?: Coordinates;
}>;

export type ClassificationType = "ANNOTATOR" | "ANNOTATOR_DOMAIN" | "LABEL" | "EXTRACTOR";

export type ClassificationSubtype =
	| "DICTIONARY"
	| "NAMED_ENTITY"
	| "NONE"
	| "REGEX"
	| "SMART"
	| "STANDARD";

/** One entry of `GET /api/v1/classifications` — the query vocabulary. */
export type Classification = Readonly<{
	id: string;
	name: string;
	type: ClassificationType;
	description: string;
	createdAt: string;
	updatedAt: string;
	link: string;
	subtype?: ClassificationSubtype;
	searchLink?: string;
}>;

/** One entry of `GET /api/v1/redactors`. Note the numeric id. */
export type Redactor = Readonly<{
	id: number;
	name: string;
	createdAt: string;
	updatedAt: string;
}>;

export type ApiEnvelope<Data> = Readonly<{
	status: string;
	data: Data;
}>;

export type ApiErrorResponse = Readonly<{
	status: "error";
	error: Readonly<{ code?: string; message?: string }>;
}>;
