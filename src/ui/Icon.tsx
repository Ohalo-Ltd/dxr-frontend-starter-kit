/**
 * Inline SVG icon set.
 *
 * Icons are inlined paths rather than a font or sprite sheet so the strict
 * `font-src 'self'` / `img-src 'self'` CSP needs no relaxation and no network
 * request is required to render a control. Add a path here rather than
 * introducing an icon dependency.
 */

const paths = {
	app: "M4 5h16v14H4zM4 9h16",
	check: "M4 12.5 9 17.5 20 6.5",
	chevronDown: "M6 9.5 12 15.5 18 9.5",
	chevronUp: "M6 14.5 12 8.5 18 14.5",
	close: "M6 6 18 18M18 6 6 18",
	file: "M6 3h7l5 5v13H6zM13 3v5h5",
	filter: "M4 6h16M7 12h10M10 18h4",
	info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
	list: "M4 7h16M4 12h16M4 17h16",
	navCollapse: "M14 6 8 12 14 18M18 5v14",
	navExpand: "M10 6 16 12 10 18M6 5v14",
	overview: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
	person: "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c0-3.4 3.1-5.5 7-5.5s7 2.1 7 5.5",
	search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16.5 16.5 21 21",
	settings:
		"M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5l2.6-1.5",
	sort: "M8 9.5 12 5.5 16 9.5M8 14.5 12 18.5 16 14.5",
	sortAsc: "M8 10.5 12 6.5 16 10.5",
	sortDesc: "M8 13.5 12 17.5 16 13.5",
	success: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5 11 15.5 16 9.5",
	warning: "M12 4 21 20H3zM12 10v4M12 17h.01",
} as const;

export type IconKind = keyof typeof paths;

type IconProps = Readonly<{
	kind: IconKind;
	label?: string | undefined;
	className?: string | undefined;
}>;

/**
 * Renders a decorative icon by default. Pass `label` only when the icon is the
 * sole carrier of meaning; otherwise keep it hidden from assistive technology
 * and let adjacent text name the control.
 */
export function Icon({ kind, label, className }: IconProps) {
	return (
		<svg
			className={className === undefined ? "icon" : `icon ${className}`}
			viewBox="0 0 24 24"
			role={label === undefined ? "presentation" : "img"}
			aria-hidden={label === undefined ? true : undefined}
			aria-label={label}
			focusable="false"
		>
			{label !== undefined && <title>{label}</title>}
			<path d={paths[kind]} />
		</svg>
	);
}
