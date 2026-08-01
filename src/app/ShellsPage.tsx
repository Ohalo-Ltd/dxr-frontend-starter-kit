import { type ReactNode, useState } from "react";
import {
	AppBrand,
	MinimalNavigationShell,
	SidebarNavigationShell,
	TopNavigationShell,
} from "../components";
import type { RuntimeConfig } from "../config/runtimeConfig";
import { Icon, type IconKind, Nav, NavItem, NavLink, Notice, VerticalNav } from "../ui";

type ShellsPageProps = Readonly<{
	config: RuntimeConfig;
}>;

/**
 * Gallery-only comparison of the navigation shell components.
 *
 * The examples contain placeholder navigation and content slots, never module
 * workflow. Pick the smallest shell that matches the information hierarchy,
 * build a different module-owned layout, or use no persistent navigation at all.
 *
 * Delete this page from a real application.
 */
export function ShellsPage({ config }: ShellsPageProps) {
	const [activeTopDestination, setActiveTopDestination] = useState("overview");

	return (
		<div className="shells-page">
			<header className="page-section__heading">
				<p className="eyebrow">Navigation-only layouts</p>
				<h1>Shells</h1>
				<p className="lede">
					Three optional persistent-navigation references. Each renders the real component with
					caller-owned slots; none is a required app structure.
				</p>
			</header>

			<Notice tone="info" title="Choose the smallest useful shell">
				<p>
					Focused reports can use the minimal masthead — or no shell. Shallow apps use top
					navigation. Reserve the sidebar for a durable hierarchy with several destinations.
				</p>
			</Notice>

			<ShellExample
				title="Sidebar navigation"
				description="For several durable destinations. It collapses on desktop and becomes an explicit menu on small screens."
			>
				<SidebarNavigationShell
					brand={<AppBrand appName={config.appName} brand={config.brand} />}
					navigation={
						<nav aria-label="Sidebar example navigation">
							<VerticalNav>
								<ExampleSidebarLink label="Overview" icon="overview" current />
								<ExampleSidebarLink label="Results" icon="list" />
								<ExampleSidebarLink label="Settings" icon="settings" />
							</VerticalNav>
						</nav>
					}
					utility={<ExampleUtility />}
					mainId="sidebar-example-content"
					sidebarLabel="Sidebar shell example"
				>
					<ExampleContent title="Sidebar content slot" />
				</SidebarNavigationShell>
			</ShellExample>

			<ShellExample
				title="Top navigation"
				description="For a shallow set of sibling destinations. The compact identity row scrolls away while the tab row stays available."
			>
				<TopNavigationShell
					brand={<AppBrand appName={config.appName} brand={config.brand} />}
					navigation={
						<nav aria-label="Top example navigation">
							<Nav tabs className="navigation-shell__tab-list">
								{["overview", "results", "account"].map((destination) => (
									<NavItem key={destination}>
										{/* A gallery switch, so this is a button: nothing navigates. */}
										<button
											type="button"
											className={`nav-link${activeTopDestination === destination ? " active" : ""}`}
											aria-current={activeTopDestination === destination ? "true" : undefined}
											onClick={() => setActiveTopDestination(destination)}
										>
											{destination.charAt(0).toUpperCase() + destination.slice(1)}
										</button>
									</NavItem>
								))}
							</Nav>
						</nav>
					}
					mainId="top-example-content"
				>
					<ExampleContent title="Top-navigation content slot" />
				</TopNavigationShell>
			</ShellExample>

			<ShellExample
				title="Minimal masthead"
				description="For a focused tool or report that only needs compact identity. Omit the shell when even that is unnecessary."
			>
				<MinimalNavigationShell
					brand={<AppBrand appName={config.appName} brand={config.brand} />}
					mainId="minimal-example-content"
				>
					<ExampleContent title="Focused content slot" />
				</MinimalNavigationShell>
			</ShellExample>
		</div>
	);
}

function ExampleSidebarLink({
	label,
	icon,
	current = false,
}: Readonly<{
	label: string;
	icon: IconKind;
	current?: boolean;
}>) {
	return (
		<li className="nav-item">
			<NavLink href="#shells" current={current} title={label}>
				<Icon kind={icon} />
				<span>{label}</span>
			</NavLink>
		</li>
	);
}

function ShellExample({
	title,
	description,
	children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
	const headingId = `shell-${title.toLowerCase().replaceAll(" ", "-")}`;

	return (
		<section className="shell-example" aria-labelledby={headingId}>
			<div className="page-section__heading">
				<h2 id={headingId}>{title}</h2>
				<p>{description}</p>
			</div>
			<div className="shell-example__viewport">{children}</div>
		</section>
	);
}

function ExampleUtility() {
	return (
		<span className="navigation-shell__identity">
			<Icon kind="person" />
			<span>Account</span>
		</span>
	);
}

function ExampleContent({ title }: Readonly<{ title: string }>) {
	return (
		<div className="shell-example__content">
			<p className="eyebrow">Main content</p>
			<h3>{title}</h3>
			<p>Pages, routes, controls, and module workflow belong here — not in the shell.</p>
		</div>
	);
}
