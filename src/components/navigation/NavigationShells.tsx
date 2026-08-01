import {
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	useId,
	useRef,
	useState,
} from "react";
import { Button } from "../../ui";

export interface NavigationShellProps {
	brand: ReactNode;
	navigation: ReactNode;
	children: ReactNode;
	utility?: ReactNode;
	mainId?: string;
	defaultCollapsed?: boolean;
	sidebarLabel?: string;
}

export type MinimalNavigationShellProps = Omit<
	NavigationShellProps,
	"defaultCollapsed" | "navigation" | "sidebarLabel"
>;

/**
 * Optional navigation-only reference, not a mandatory app structure.
 *
 * Use it only for a durable broader hierarchy. Tailor or replace its slots and
 * responsive behavior; do not add module workflows to this component.
 * Preserve landmarks, keyboard access, and server-owned authorization.
 */
export function SidebarNavigationShell({
	brand,
	navigation,
	children,
	utility,
	mainId = "main-content",
	defaultCollapsed = false,
	sidebarLabel = "Application",
}: Readonly<NavigationShellProps>) {
	const [collapsed, setCollapsed] = useState(defaultCollapsed);
	const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
	const mobileNavigationId = useId();
	const mobileToggleRef = useRef<HTMLButtonElement>(null);

	function closeMobileNavigationFromLink(event: MouseEvent<HTMLDivElement>) {
		if (event.target instanceof Element && event.target.closest("a")) {
			setMobileNavigationOpen(false);
		}
	}

	function closeMobileNavigationFromEscape(event: KeyboardEvent<HTMLElement>) {
		if (event.key !== "Escape" || !mobileNavigationOpen) return;
		event.preventDefault();
		setMobileNavigationOpen(false);
		mobileToggleRef.current?.focus();
	}

	return (
		<div
			className="navigation-shell navigation-shell--sidebar"
			data-sidebar-collapsed={collapsed}
			data-mobile-navigation-open={mobileNavigationOpen}
		>
			<a className="skip-link" href={`#${mainId}`}>
				Skip to content
			</a>
			<aside
				className="navigation-shell__sidebar"
				aria-label={sidebarLabel}
				onKeyDownCapture={closeMobileNavigationFromEscape}
			>
				<div className="navigation-shell__brand">{brand}</div>
				<Button
					ref={mobileToggleRef}
					className="navigation-shell__mobile-toggle"
					kind="ghost"
					size="sm"
					icon="list"
					aria-controls={mobileNavigationId}
					aria-expanded={mobileNavigationOpen}
					aria-label={mobileNavigationOpen ? "Close navigation" : "Open navigation"}
					onClick={() => setMobileNavigationOpen((current) => !current)}
				>
					{mobileNavigationOpen ? "Close" : "Menu"}
				</Button>
				<div
					className="navigation-shell__nav"
					id={mobileNavigationId}
					onClickCapture={closeMobileNavigationFromLink}
				>
					{navigation}
				</div>
				<footer className="navigation-shell__footer">
					{utility && <div className="navigation-shell__utility">{utility}</div>}
					<Button
						className="navigation-shell__collapse-toggle"
						kind="ghost"
						size="sm"
						icon={collapsed ? "navExpand" : "navCollapse"}
						aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
						title={collapsed ? "Expand navigation" : "Collapse navigation"}
						onClick={() => setCollapsed((current) => !current)}
					/>
				</footer>
			</aside>
			<main className="navigation-shell__main" id={mainId}>
				{children}
			</main>
		</div>
	);
}

/**
 * Optional shallow-navigation reference, not a mandatory app structure.
 *
 * Use it only when sibling views warrant persistent top navigation. Tailor,
 * replace, or omit it without adding module workflow to the shell. Preserve
 * semantic landmarks, visible focus, and server-owned authorization.
 */
export function TopNavigationShell({
	brand,
	navigation,
	children,
	utility,
	mainId = "main-content",
}: Readonly<NavigationShellProps>) {
	return (
		<div className="navigation-shell navigation-shell--top">
			<a className="skip-link" href={`#${mainId}`}>
				Skip to content
			</a>
			<header className="navigation-shell__header">
				<div className="navigation-shell__brand">{brand}</div>
				{utility && <div className="navigation-shell__utility">{utility}</div>}
			</header>
			<div className="navigation-shell__tabs">{navigation}</div>
			<main className="navigation-shell__main" id={mainId}>
				{children}
			</main>
		</div>
	);
}

/**
 * Optional minimal masthead reference for focused tools and reports.
 *
 * Use it only when persistent identity or a small utility affordance adds
 * value; otherwise render the page without a shell. Tailor or replace its
 * product layout. Add navigation in the module only when the minimal pattern
 * is no longer the right fit. Preserve accessible identity and landmarks.
 */
export function MinimalNavigationShell({
	brand,
	children,
	utility,
	mainId = "main-content",
}: Readonly<MinimalNavigationShellProps>) {
	return (
		<div className="navigation-shell navigation-shell--minimal">
			<a className="skip-link" href={`#${mainId}`}>
				Skip to content
			</a>
			<header className="navigation-shell__masthead">
				<div className="navigation-shell__brand">{brand}</div>
				{utility && <div className="navigation-shell__utility">{utility}</div>}
			</header>
			<main className="navigation-shell__main" id={mainId}>
				{children}
			</main>
		</div>
	);
}
