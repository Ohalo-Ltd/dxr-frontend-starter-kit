import type { RuntimeConfig } from "../../config/runtimeConfig";

export interface AppBrandProps {
	appName: string;
	brand?: RuntimeConfig["brand"];
}

/**
 * Optional application identity lockup.
 *
 * The name comes from validated runtime configuration, never from a hardcoded
 * string, so one build can ship under different names. In `customer` mode the
 * logo path has already been constrained to a same-origin `/branding/` asset by
 * `parseRuntimeConfig`; do not widen that boundary here.
 *
 * Replace this component freely — it is a layout, not a contract. Keep the
 * accessible name and the same-origin asset rule.
 */
export function AppBrand({ appName, brand = { mode: "module" } }: Readonly<AppBrandProps>) {
	return (
		<div className="app-brand">
			<div className="app-brand__product">
				<img src="/favicon.svg" alt="" width="22" height="22" />
				<span>{appName}</span>
			</div>
			{brand.mode === "customer" && (
				<div className="app-brand__customer">
					<span aria-hidden="true" />
					<img src={brand.customerLogoPath} alt={`${brand.customerName} logo`} />
					<small>{brand.customerName}</small>
				</div>
			)}
		</div>
	);
}
