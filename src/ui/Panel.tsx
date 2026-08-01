import type { ReactNode } from "react";
import { Icon, type IconKind } from "./Icon";

/** A bordered content surface. Purely presentational. */
export function Panel({
	children,
	className,
}: Readonly<{ children: ReactNode; className?: string | undefined }>) {
	return <div className={className === undefined ? "panel" : `panel ${className}`}>{children}</div>;
}

type PanelSectionProps = Readonly<{
	title?: ReactNode | undefined;
	icon?: IconKind | undefined;
	/** Heading level for the title. Pick the level the page outline needs. */
	headingLevel?: 2 | 3 | 4 | undefined;
	children: ReactNode;
}>;

/**
 * A titled region inside a `Panel`.
 *
 * The title renders as a real heading so the page keeps a usable outline.
 * Choose `headingLevel` to match the surrounding document structure rather than
 * relying on a default.
 */
export function PanelSection({ title, icon, headingLevel = 3, children }: PanelSectionProps) {
	const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

	return (
		<section className="panel-section">
			{title !== undefined && (
				<Heading className="panel-section__title">
					{icon !== undefined && <Icon kind={icon} />}
					{title}
				</Heading>
			)}
			{children}
		</section>
	);
}
