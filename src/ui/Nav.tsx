import type { AnchorHTMLAttributes, ReactNode } from "react";

/** A horizontal navigation list. Wrap it in a labelled `<nav>` landmark. */
export function Nav({
	children,
	tabs = false,
	className,
}: Readonly<{ children: ReactNode; tabs?: boolean | undefined; className?: string | undefined }>) {
	return (
		<ul className={["nav", tabs ? "nav--tabs" : undefined, className].filter(Boolean).join(" ")}>
			{children}
		</ul>
	);
}

/** A vertical navigation list, for sidebar destinations. */
export function VerticalNav({
	children,
	className,
}: Readonly<{ children: ReactNode; className?: string | undefined }>) {
	return (
		<ul className={className === undefined ? "vertical-nav" : `vertical-nav ${className}`}>
			{children}
		</ul>
	);
}

export function NavItem({ children }: Readonly<{ children: ReactNode }>) {
	return <li className="nav-item">{children}</li>;
}

type NavLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> &
	Readonly<{
		/** Marks the destination the user is currently on. */
		current?: boolean | undefined;
		className?: string | undefined;
		children: ReactNode;
	}>;

/**
 * A navigation link.
 *
 * `current` sets both the active style and `aria-current="page"`, so the visual
 * and accessible states cannot diverge.
 */
export function NavLink({ current = false, className, children, ...rest }: NavLinkProps) {
	return (
		<a
			className={["nav-link", current ? "active" : undefined, className].filter(Boolean).join(" ")}
			aria-current={current ? "page" : undefined}
			{...rest}
		>
			{children}
		</a>
	);
}
