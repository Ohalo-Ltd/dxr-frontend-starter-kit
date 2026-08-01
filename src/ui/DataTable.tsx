import { type ReactNode, useMemo, useState } from "react";
import { Icon } from "./Icon";

export type DataTableColumn<Row> = Readonly<{
	key: string;
	header: string;
	cell: (row: Row) => ReactNode;
	/**
	 * Sort key for this column. Omit to make the column unsortable. Returning
	 * `undefined` sorts that row last regardless of direction.
	 */
	sortValue?: (row: Row) => string | number | undefined;
	numeric?: boolean | undefined;
}>;

type SortState = Readonly<{ key: string; direction: "ascending" | "descending" }>;

type DataTableProps<Row> = Readonly<{
	columns: ReadonlyArray<DataTableColumn<Row>>;
	rows: readonly Row[];
	/** Server-issued stable identity. Never derive this from the row position. */
	getRowId: (row: Row) => string;
	/** Describes the table and states what the row count means. */
	caption: ReactNode;
	emptyMessage: ReactNode;
	selectedRowId?: string | undefined;
	onRowActivate?: ((row: Row) => void) | undefined;
	initialSort?: SortState | undefined;
	className?: string | undefined;
}>;

/**
 * A semantic, sortable table over rows already held in memory.
 *
 * This kit deliberately has no server-side table model: the Data X-Ray v1 file
 * endpoint offers no pagination, sort, or total count, so sorting a bounded
 * result set on the client is the honest implementation. If a future API grows
 * server-side paging, replace this component rather than pretending the client
 * page is the whole result.
 */
export function DataTable<Row>({
	columns,
	rows,
	getRowId,
	caption,
	emptyMessage,
	selectedRowId,
	onRowActivate,
	initialSort,
	className,
}: DataTableProps<Row>) {
	const [sort, setSort] = useState<SortState | undefined>(initialSort);

	const sortedRows = useMemo(() => {
		if (sort === undefined) return rows;
		const column = columns.find((candidate) => candidate.key === sort.key);
		if (column?.sortValue === undefined) return rows;

		const { sortValue } = column;
		const factor = sort.direction === "ascending" ? 1 : -1;
		return [...rows].sort((left, right) => {
			const a = sortValue(left);
			const b = sortValue(right);
			// Missing values sort last in both directions, so toggling direction
			// never promotes an empty cell to the top.
			if (a === undefined && b === undefined) return 0;
			if (a === undefined) return 1;
			if (b === undefined) return -1;
			if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
			return String(a).localeCompare(String(b), undefined, { numeric: true }) * factor;
		});
	}, [columns, rows, sort]);

	function toggleSort(key: string) {
		setSort((current) =>
			current?.key === key
				? { key, direction: current.direction === "ascending" ? "descending" : "ascending" }
				: { key, direction: "ascending" },
		);
	}

	return (
		<div
			className={className === undefined ? "data-table__scroll" : `data-table__scroll ${className}`}
		>
			<table className="data-table">
				<caption>{caption}</caption>
				<thead>
					<tr>
						{columns.map((column) => {
							const isSorted = sort?.key === column.key;
							return (
								<th
									key={column.key}
									scope="col"
									aria-sort={
										column.sortValue === undefined ? undefined : isSorted ? sort.direction : "none"
									}
									className={column.numeric === true ? "data-table__numeric" : undefined}
								>
									{column.sortValue === undefined ? (
										column.header
									) : (
										<button
											type="button"
											className="data-table__sort"
											onClick={() => toggleSort(column.key)}
										>
											{column.header}
											<Icon
												kind={
													isSorted
														? sort.direction === "ascending"
															? "sortAsc"
															: "sortDesc"
														: "sort"
												}
											/>
										</button>
									)}
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{sortedRows.length === 0 ? (
						<tr>
							<td className="data-table__empty" colSpan={columns.length}>
								{emptyMessage}
							</td>
						</tr>
					) : (
						sortedRows.map((row) => {
							const id = getRowId(row);
							return (
								<tr
									key={id}
									aria-selected={selectedRowId === undefined ? undefined : selectedRowId === id}
								>
									{columns.map((column, index) =>
										// The first column is the row header, and it carries the activation
										// control when the caller supplies one.
										index === 0 ? (
											<th
												key={column.key}
												scope="row"
												className={column.numeric === true ? "data-table__numeric" : undefined}
											>
												{onRowActivate === undefined ? (
													column.cell(row)
												) : (
													<button
														type="button"
														className="data-table__row-button"
														onClick={() => onRowActivate(row)}
													>
														{column.cell(row)}
													</button>
												)}
											</th>
										) : (
											<td
												key={column.key}
												className={column.numeric === true ? "data-table__numeric" : undefined}
											>
												{column.cell(row)}
											</td>
										),
									)}
								</tr>
							);
						})
					)}
				</tbody>
			</table>
		</div>
	);
}
