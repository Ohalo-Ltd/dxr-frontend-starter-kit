import type { FileMetadata } from "../../dxr";
import { DataTable, type DataTableColumn } from "../../ui";

/** Formats a byte count for display without pretending to more precision. */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "—";
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
}

/** Renders a timestamp as a date, or an em dash when the field is absent. */
export function formatDate(value: string | undefined): string {
	if (value === undefined) return "—";
	const parsed = Date.parse(value);
	if (Number.isNaN(parsed)) return "—";
	return new Date(parsed).toISOString().slice(0, 10);
}

/** Total distinct sensitive phrases across every annotator on the file. */
export function totalUniquePhrases(file: FileMetadata): number {
	return (file.annotators ?? []).reduce((sum, annotator) => sum + annotator.uniquePhrases, 0);
}

const columns: ReadonlyArray<DataTableColumn<FileMetadata>> = [
	{
		cell: (file) => file.fileName,
		header: "File",
		key: "fileName",
		sortValue: (file) => file.fileName,
	},
	{
		cell: (file) => file.datasource.name,
		header: "Datasource",
		key: "datasource",
		sortValue: (file) => file.datasource.name,
	},
	{
		cell: (file) => {
			const annotators = file.annotators ?? [];
			if (annotators.length === 0) {
				// An empty result is meaningful: a discovery-only scan never produces
				// annotators, which is different from "scanned and found nothing".
				return file.scanDepth === "DISCOVERY" ? "Not classified" : "None";
			}
			return annotators.map((annotator) => annotator.name).join(", ");
		},
		header: "Sensitive data",
		key: "annotators",
		sortValue: (file) => totalUniquePhrases(file),
	},
	{
		cell: (file) => (file.labels.length === 0 ? "—" : file.labels.map((l) => l.name).join(", ")),
		header: "Labels",
		key: "labels",
		sortValue: (file) => file.labels.length,
	},
	{
		cell: (file) => formatBytes(file.size),
		header: "Size",
		key: "size",
		numeric: true,
		sortValue: (file) => file.size,
	},
	{
		cell: (file) => formatDate(file.lastModifiedAt),
		header: "Modified",
		key: "lastModifiedAt",
		sortValue: (file) => file.lastModifiedAt ?? undefined,
	},
];

type FilesResultsTableProps = Readonly<{
	files: readonly FileMetadata[];
	selectedFileId?: string | undefined;
	onFileSelect: (file: FileMetadata) => void;
	caption: string;
	emptyMessage: string;
}>;

/**
 * The result table.
 *
 * Sorting is client-side across the rows already streamed, because v1 has no
 * server-side sort. The caption must therefore say what the row count means —
 * it is never a total.
 */
export function FilesResultsTable({
	files,
	selectedFileId,
	onFileSelect,
	caption,
	emptyMessage,
}: FilesResultsTableProps) {
	return (
		<DataTable
			className="files-table"
			columns={columns}
			rows={files}
			getRowId={(file) => file.fileId}
			caption={caption}
			emptyMessage={emptyMessage}
			selectedRowId={selectedFileId}
			onRowActivate={onFileSelect}
		/>
	);
}
