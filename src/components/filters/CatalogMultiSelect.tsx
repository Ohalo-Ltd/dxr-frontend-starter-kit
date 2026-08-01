import { useMemo, useState } from "react";
import type { CatalogEntry } from "../../dxr";
import { Button, Checkbox, DropdownMenu, SearchInput } from "../../ui";

/** Rendered rows are capped so a large catalog cannot stall the menu. */
const VISIBLE_LIMIT = 200;

type CatalogMultiSelectProps = Readonly<{
	label: string;
	entries: readonly CatalogEntry[];
	selected: readonly string[];
	onSelectedChange: (selected: readonly string[]) => void;
	/** Shown when the catalog has no entries of this kind. */
	emptyMessage: string;
	disabled?: boolean | undefined;
}>;

/**
 * A searchable multi-select over one classification vocabulary.
 *
 * Selection is by **name**, because names are what the query language matches
 * on. Changes are reported upward immediately, but the caller holds them as a
 * draft until the user applies the filter, so no request is issued per tick.
 */
export function CatalogMultiSelect({
	label,
	entries,
	selected,
	onSelectedChange,
	emptyMessage,
	disabled = false,
}: CatalogMultiSelectProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");

	const matches = useMemo(() => {
		const needle = search.trim().toLocaleLowerCase();
		if (needle === "") return entries;
		return entries.filter(
			(entry) =>
				entry.name.toLocaleLowerCase().includes(needle) ||
				entry.description.toLocaleLowerCase().includes(needle),
		);
	}, [entries, search]);

	const visible = matches.slice(0, VISIBLE_LIMIT);
	const selectedSet = new Set(selected);

	function toggle(name: string) {
		onSelectedChange(
			selectedSet.has(name) ? selected.filter((item) => item !== name) : [...selected, name],
		);
	}

	return (
		<DropdownMenu
			label={label}
			icon="filter"
			isOpen={isOpen}
			onOpenChange={setIsOpen}
			count={selected.length}
			menuClassName="filter-menu"
		>
			<div className="filter-menu__search">
				<SearchInput
					label={`Search ${label.toLocaleLowerCase()}`}
					value={search}
					placeholder="Search"
					onChange={(event) => setSearch(event.target.value)}
				/>
			</div>

			{entries.length === 0 ? (
				<p className="filter-menu__empty">{emptyMessage}</p>
			) : matches.length === 0 ? (
				<p className="filter-menu__empty">No matches for “{search.trim()}”.</p>
			) : (
				<div className="filter-menu__items">
					{visible.map((entry) => (
						<Checkbox
							key={entry.id}
							label={entry.name}
							meta={entry.description === "" ? undefined : entry.description}
							checked={selectedSet.has(entry.name)}
							disabled={disabled}
							onChange={() => toggle(entry.name)}
						/>
					))}
				</div>
			)}

			{matches.length > visible.length && (
				<small className="filter-menu__limit">
					Showing the first {VISIBLE_LIMIT} of {matches.length} matches. Narrow the search to see
					the rest.
				</small>
			)}

			<div className="filter-menu__actions filter-menu__actions--split">
				<Button
					kind="ghost"
					size="sm"
					disabled={selected.length === 0}
					onClick={() => onSelectedChange([])}
				>
					Clear
				</Button>
				<Button kind="secondary" size="sm" onClick={() => setIsOpen(false)}>
					Done
				</Button>
			</div>
		</DropdownMenu>
	);
}
