import { useState } from "react";
import type { Catalog, ConnectorType, FilterModel } from "../../dxr";
import { Button, DropdownMenu, Select, TextInput } from "../../ui";
import { CatalogMultiSelect } from "./CatalogMultiSelect";

/** Fixed by the API, so this list is a constant rather than a fetched vocabulary. */
const CONNECTOR_TYPES: readonly ConnectorType[] = [
	"AMAZON_S3",
	"AZURE_BLOB_STORAGE",
	"BOX",
	"CONTENT_SUITE",
	"FILE_UPLOAD",
	"FOLDER_PATH",
	"GOOGLE_CLOUD_STORAGE",
	"GOOGLE_DRIVE_GOOGLE_WORKSPACE",
	"GOOGLE_SHARED_DRIVE_GOOGLE_WORKSPACE",
	"NETWORK_DRIVE_SMB",
	"NETWORK_DRIVE_SMB_LEGACY",
	"NETWORK_DRIVE_SSH",
	"ON_DEMAND_CLASSIFIER",
	"ONEDRIVE_GRAPH_API",
	"SHAREPOINT_2016_2019_REST_API",
	"SHAREPOINT_ONLINE_GRAPH_API",
];

const EXTRACTION_STATUSES = [
	"SUCCESS",
	"SKIPPED",
	"DISABLED",
	"FILTERED",
	"TEXT_UNAVAILABLE",
	"UNSUPPORTED_MIME_TYPE",
] as const;

type FilterBuilderProps = Readonly<{
	catalog: Catalog;
	draft: FilterModel;
	onDraftChange: (draft: FilterModel) => void;
	onApply: () => void;
	onReset: () => void;
	/** True while a search is running, so Apply cannot be double-fired. */
	busy: boolean;
	dirty: boolean;
}>;

/**
 * Builds a query from the instance's own classification catalog.
 *
 * The catalog matters because Data X-Ray classifies file *contents*. Filtering
 * on an annotator, domain, or label finds files regardless of what they are
 * named, which a file-name search cannot do.
 *
 * Selections are a draft: nothing is requested until the user presses Apply.
 * That keeps a multi-part filter from firing a request per checkbox and makes
 * the compiled query predictable.
 */
export function FilterBuilder({
	catalog,
	draft,
	onDraftChange,
	onApply,
	onReset,
	busy,
	dirty,
}: FilterBuilderProps) {
	const [connectorsOpen, setConnectorsOpen] = useState(false);
	const [attributesOpen, setAttributesOpen] = useState(false);
	const [accessOpen, setAccessOpen] = useState(false);

	const patch = (changes: Partial<FilterModel>) => onDraftChange({ ...draft, ...changes });

	function toggleConnector(type: ConnectorType) {
		patch({
			connectorTypes: draft.connectorTypes.includes(type)
				? draft.connectorTypes.filter((item) => item !== type)
				: [...draft.connectorTypes, type],
		});
	}

	const accessCount = [draft.accessAccountType, draft.accessName, draft.accessEmail].filter(
		(value) => value.trim() !== "",
	).length;
	const attributeCount = [
		draft.fileName,
		draft.path,
		draft.mimeType,
		draft.minSizeBytes,
		draft.maxSizeBytes,
		draft.minUniquePhrases,
		draft.modifiedWithinDays,
		draft.createdAfter,
		draft.scanDepth,
		draft.metadataExtractionStatus,
		draft.extractedValue,
		draft.datasourceName,
	].filter((value) => value.trim() !== "").length;

	return (
		<div className="filter-bar">
			<CatalogMultiSelect
				label="Sensitive data"
				entries={catalog.annotators}
				selected={draft.annotators}
				onSelectedChange={(annotators) => patch({ annotators })}
				emptyMessage="This instance reports no annotators."
			/>
			<CatalogMultiSelect
				label="Domain"
				entries={catalog.domains}
				selected={draft.domains}
				onSelectedChange={(domains) => patch({ domains })}
				emptyMessage="This instance reports no annotator domains."
			/>
			<CatalogMultiSelect
				label="Label"
				entries={catalog.labels}
				selected={draft.labels}
				onSelectedChange={(labels) => patch({ labels })}
				emptyMessage="This instance reports no labels."
			/>
			<CatalogMultiSelect
				label="Extractor"
				entries={catalog.extractors}
				selected={draft.extractors}
				onSelectedChange={(extractors) => patch({ extractors })}
				emptyMessage="This instance reports no metadata extractors."
			/>

			<DropdownMenu
				label="Connector"
				icon="app"
				isOpen={connectorsOpen}
				onOpenChange={setConnectorsOpen}
				count={draft.connectorTypes.length}
				menuClassName="filter-menu"
			>
				<div className="filter-menu__items">
					{CONNECTOR_TYPES.map((type) => (
						<label className="checkbox" key={type}>
							<input
								type="checkbox"
								checked={draft.connectorTypes.includes(type)}
								onChange={() => toggleConnector(type)}
							/>
							<span className="checkbox__label">{type}</span>
						</label>
					))}
				</div>
				<div className="filter-menu__actions filter-menu__actions--split">
					<Button
						kind="ghost"
						size="sm"
						disabled={draft.connectorTypes.length === 0}
						onClick={() => patch({ connectorTypes: [] })}
					>
						Clear
					</Button>
					<Button kind="secondary" size="sm" onClick={() => setConnectorsOpen(false)}>
						Done
					</Button>
				</div>
			</DropdownMenu>

			<DropdownMenu
				label="File attributes"
				icon="file"
				isOpen={attributesOpen}
				onOpenChange={setAttributesOpen}
				count={attributeCount}
				menuClassName="filter-menu filter-menu--labels"
			>
				<div className="filter-menu__items">
					<TextInput
						label="File name contains"
						value={draft.fileName}
						placeholder="invoice"
						onChange={(event) => patch({ fileName: event.target.value })}
					/>
					<TextInput
						label="Path contains"
						value={draft.path}
						placeholder="/HR/Payroll"
						onChange={(event) => patch({ path: event.target.value })}
					/>
					<TextInput
						label="MIME type contains"
						value={draft.mimeType}
						placeholder="pdf"
						onChange={(event) => patch({ mimeType: event.target.value })}
					/>
					<TextInput
						label="Datasource name contains"
						value={draft.datasourceName}
						hint="There is no v1 endpoint that lists datasources, so this is a text match."
						onChange={(event) => patch({ datasourceName: event.target.value })}
					/>
					<TextInput
						label="Extracted value contains"
						value={draft.extractedValue}
						placeholder="Invoice"
						onChange={(event) => patch({ extractedValue: event.target.value })}
					/>
					<TextInput
						label="Minimum size (bytes)"
						value={draft.minSizeBytes}
						inputMode="numeric"
						onChange={(event) => patch({ minSizeBytes: event.target.value })}
					/>
					<TextInput
						label="Maximum size (bytes)"
						value={draft.maxSizeBytes}
						inputMode="numeric"
						onChange={(event) => patch({ maxSizeBytes: event.target.value })}
					/>
					<TextInput
						label="Minimum unique phrases"
						value={draft.minUniquePhrases}
						inputMode="numeric"
						hint="Distinct matches for any annotator on the file."
						onChange={(event) => patch({ minUniquePhrases: event.target.value })}
					/>
					<TextInput
						label="Modified within (days)"
						value={draft.modifiedWithinDays}
						inputMode="numeric"
						onChange={(event) => patch({ modifiedWithinDays: event.target.value })}
					/>
					<TextInput
						label="Created on or after"
						type="date"
						value={draft.createdAfter}
						onChange={(event) => patch({ createdAfter: event.target.value })}
					/>
					<Select
						label="Scan depth"
						value={draft.scanDepth}
						onChange={(event) =>
							patch({ scanDepth: event.target.value as FilterModel["scanDepth"] })
						}
					>
						<option value="">Any</option>
						<option value="DISCOVERY">DISCOVERY</option>
						<option value="DISCOVERY_AND_CLASSIFICATION">DISCOVERY_AND_CLASSIFICATION</option>
					</Select>
					<Select
						label="Metadata extraction status"
						value={draft.metadataExtractionStatus}
						onChange={(event) => patch({ metadataExtractionStatus: event.target.value })}
					>
						<option value="">Any</option>
						{EXTRACTION_STATUSES.map((status) => (
							<option key={status} value={status}>
								{status}
							</option>
						))}
					</Select>
				</div>
			</DropdownMenu>

			<DropdownMenu
				label="Who can access"
				icon="person"
				isOpen={accessOpen}
				onOpenChange={setAccessOpen}
				count={accessCount}
				menuClassName="filter-menu filter-menu--labels"
			>
				<div className="filter-menu__items">
					<p className="status-text">
						Matches when a single account on the file satisfies every condition below. Useful for
						finding over-shared records, for example account type GROUP named Everyone.
					</p>
					<Select
						label="Account type"
						value={draft.accessAccountType}
						onChange={(event) => patch({ accessAccountType: event.target.value })}
					>
						<option value="">Any</option>
						<option value="GROUP">GROUP</option>
						<option value="USER">USER</option>
					</Select>
					<TextInput
						label="Account name"
						value={draft.accessName}
						placeholder="Everyone"
						onChange={(event) => patch({ accessName: event.target.value })}
					/>
					<TextInput
						label="Account email"
						value={draft.accessEmail}
						placeholder="*@example.com"
						hint="A wildcard is allowed."
						onChange={(event) => patch({ accessEmail: event.target.value })}
					/>
				</div>
			</DropdownMenu>

			<div className="filter-bar__actions">
				<Button kind="ghost" onClick={onReset} disabled={busy}>
					Reset
				</Button>
				<Button kind="primary" onClick={onApply} disabled={busy}>
					{dirty ? "Apply filters" : "Search"}
				</Button>
			</div>
		</div>
	);
}
