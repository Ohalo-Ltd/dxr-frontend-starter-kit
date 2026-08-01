import { lazy, Suspense, useEffect, useState } from "react";
import { AppBrand, SidebarNavigationShell } from "../components";
import type { RuntimeConfig } from "../config/runtimeConfig";
import { Icon, NavLink, VerticalNav } from "../ui";

const FilesPage = lazy(async () => {
	const module = await import("./FilesPage");
	return { default: module.FilesPage };
});

const ShellsPage = lazy(async () => {
	const module = await import("./ShellsPage");
	return { default: module.ShellsPage };
});

type AppProps = Readonly<{
	config: RuntimeConfig;
}>;

type Page = "files" | "shells";

/**
 * The application shell and its view switch.
 *
 * There is no router dependency: two views do not justify one. Add a real router
 * when the module needs nested routes, route parameters, or history semantics
 * this cannot express — and record why before adding the dependency.
 */
export function App({ config }: AppProps) {
	const [page, setPage] = useState<Page>(() => readPage());

	useEffect(() => {
		const onHashChange = () => setPage(readPage());
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	return (
		<SidebarNavigationShell
			brand={<AppBrand appName={config.appName} brand={config.brand} />}
			navigation={
				<nav aria-label="Primary">
					<VerticalNav>
						<AppNavigationLink href="#files" label="Files" icon="list" current={page === "files"} />
						<AppNavigationLink
							href="#shells"
							label="Shells"
							icon="app"
							current={page === "shells"}
						/>
					</VerticalNav>
				</nav>
			}
			utility={
				<span className="navigation-shell__identity" title="Development">
					<Icon kind="person" />
					<span>Development</span>
				</span>
			}
		>
			{page === "shells" ? (
				<Suspense fallback={<p role="status">Loading shells…</p>}>
					<ShellsPage config={config} />
				</Suspense>
			) : (
				<Suspense fallback={<p role="status">Loading files…</p>}>
					<FilesPage />
				</Suspense>
			)}
		</SidebarNavigationShell>
	);
}

function AppNavigationLink({
	href,
	label,
	icon,
	current,
}: Readonly<{
	href: string;
	label: string;
	icon: "list" | "app";
	current: boolean;
}>) {
	return (
		<li className="nav-item">
			<NavLink href={href} current={current} title={label}>
				<Icon kind={icon} />
				<span>{label}</span>
			</NavLink>
		</li>
	);
}

function readPage(): Page {
	return window.location.hash === "#shells" ? "shells" : "files";
}
