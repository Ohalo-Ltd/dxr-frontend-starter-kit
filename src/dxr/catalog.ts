/**
 * Turns the classification catalog into the filter vocabulary.
 *
 * The catalog is the difference between guessing file names and querying what is
 * actually inside a file. Load it once per session: it is stable, and on a large
 * instance it can be hundreds of entries.
 */

import { getClassifications } from "./client";
import type { Classification, ClassificationType } from "./types";

/** Descriptions in the catalog can be long; menus show a bounded prefix. */
const DESCRIPTION_MAX_LENGTH = 140;

export type CatalogEntry = Readonly<{
	id: string;
	name: string;
	description: string;
	subtype?: string | undefined;
}>;

export type Catalog = Readonly<{
	annotators: readonly CatalogEntry[];
	domains: readonly CatalogEntry[];
	labels: readonly CatalogEntry[];
	extractors: readonly CatalogEntry[];
}>;

export const emptyCatalog: Catalog = {
	annotators: [],
	domains: [],
	extractors: [],
	labels: [],
};

function truncate(value: string): string {
	const collapsed = value.replace(/\s+/gu, " ").trim();
	return collapsed.length <= DESCRIPTION_MAX_LENGTH
		? collapsed
		: `${collapsed.slice(0, DESCRIPTION_MAX_LENGTH - 1)}…`;
}

function entriesOfType(
	classifications: readonly Classification[],
	type: ClassificationType,
): readonly CatalogEntry[] {
	const byName = new Map<string, CatalogEntry>();

	for (const item of classifications) {
		if (item.type !== type) continue;
		if (typeof item.name !== "string" || item.name.trim() === "") continue;
		// Names are what the query language matches on, so a duplicate name is one
		// filter option, not two.
		if (byName.has(item.name)) continue;
		byName.set(item.name, {
			description: typeof item.description === "string" ? truncate(item.description) : "",
			id: item.id,
			name: item.name,
			subtype: item.subtype,
		});
	}

	return [...byName.values()].sort((left, right) =>
		left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
	);
}

/** Partitions a catalog response into the four filterable vocabularies. */
export function toCatalog(classifications: readonly Classification[]): Catalog {
	return {
		annotators: entriesOfType(classifications, "ANNOTATOR"),
		domains: entriesOfType(classifications, "ANNOTATOR_DOMAIN"),
		extractors: entriesOfType(classifications, "EXTRACTOR"),
		labels: entriesOfType(classifications, "LABEL"),
	};
}

export async function loadCatalog(signal?: AbortSignal): Promise<Catalog> {
	return toCatalog(await getClassifications(signal));
}
