/**
 * Adaptable reference compositions.
 *
 * These are examples, not a design system and not a required architecture. Use
 * one when its interaction and state model match the module, adapt it when the
 * fit is partial, and delete it when it is unused. Do not widen a component here
 * to absorb module-specific behaviour — build that in the module from `src/ui`
 * primitives instead.
 */
export { FileDetailPanel } from "./files/FileDetailPanel";
export {
	FilesResultsTable,
	formatBytes,
	formatDate,
	totalUniquePhrases,
} from "./files/FilesResultsTable";
export { CatalogMultiSelect } from "./filters/CatalogMultiSelect";
export { FilterBuilder } from "./filters/FilterBuilder";
export { QueryView } from "./filters/QueryView";
export { AppBrand, type AppBrandProps } from "./navigation/AppBrand";
export {
	MinimalNavigationShell,
	type MinimalNavigationShellProps,
	type NavigationShellProps,
	SidebarNavigationShell,
	TopNavigationShell,
} from "./navigation/NavigationShells";
