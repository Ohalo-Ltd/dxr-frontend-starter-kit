import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Icon, type IconKind } from "./Icon";

export type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> &
	Readonly<{
		kind?: ButtonKind | undefined;
		size?: "sm" | "md" | undefined;
		icon?: IconKind | undefined;
		/** Trailing count badge, for filter-style toggles. */
		count?: number | undefined;
		className?: string | undefined;
		ref?: Ref<HTMLButtonElement> | undefined;
		children?: ReactNode | undefined;
	}>;

/**
 * A real `<button>`, always with an explicit `type`.
 *
 * An icon-only button must still carry an accessible name via `aria-label`.
 * Never render a `div` in place of this component.
 */
export function Button({
	kind = "secondary",
	size = "md",
	icon,
	count,
	className,
	children,
	type = "button",
	...rest
}: ButtonProps) {
	const iconOnly = children === undefined && icon !== undefined;
	const classes = [
		"btn",
		`btn--${kind}`,
		size === "sm" ? "btn--sm" : undefined,
		iconOnly ? "btn--icon-only" : undefined,
		className,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<button type={type} className={classes} {...rest}>
			{icon !== undefined && <Icon kind={icon} />}
			{children}
			{/* Hidden from assistive technology: a bare number appended to the label
			    reads as "Sensitive data 1". Callers that show a count give the button
			    an explicit aria-label that says what the number means. */}
			{count !== undefined && count > 0 && (
				<span className="btn__count" aria-hidden="true">
					{count}
				</span>
			)}
		</button>
	);
}
