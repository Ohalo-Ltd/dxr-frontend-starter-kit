import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const config = { appName: "Review module", brand: { mode: "module" } } as const;

/** The catalog request fires on mount, so every render needs a stubbed fetch. */
function stubCatalogFetch(classifications: unknown[] = []) {
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(JSON.stringify({ status: "ok", data: classifications }), {
					headers: { "content-type": "application/json" },
					status: 200,
				}),
		),
	);
}

describe("App", () => {
	beforeEach(() => {
		stubCatalogFetch();
	});

	afterEach(() => {
		cleanup();
		window.location.hash = "";
		vi.unstubAllGlobals();
	});

	it("renders the configured identity and an accessible shell", () => {
		render(<App config={config} />);

		expect(screen.getByText("Review module")).toBeInTheDocument();
		expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
		expect(screen.getByRole("main")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
			"href",
			"#main-content",
		);
	});

	it("renders the files page by default and marks the current destination", async () => {
		render(<App config={config} />);

		expect(
			await screen.findByRole("heading", { name: /Search by what is inside the file/, level: 1 }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Files" })).toHaveAttribute("aria-current", "page");
	});

	it("states that the row count is not a total", async () => {
		render(<App config={config} />);

		await screen.findByRole("heading", { level: 1 });
		expect(screen.getByText("No search run yet")).toBeInTheDocument();
	});

	it("shows the compiled match-all query and warns that it is unbounded", async () => {
		render(<App config={config} />);

		await screen.findByRole("heading", { level: 1 });

		// The query appears twice on purpose: once as the compiled query that will
		// be sent, and once inside the warning about searching with no filters.
		await waitFor(() => {
			expect(screen.getAllByText('fileName:"*"')).toHaveLength(2);
		});
		expect(screen.getByText("No filters selected")).toBeInTheDocument();
	});

	it("renders the navigation shell gallery", async () => {
		window.location.hash = "#shells";
		render(<App config={config} />);

		expect(await screen.findByRole("heading", { name: "Shells", level: 1 })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Sidebar navigation" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Top navigation" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Minimal masthead" })).toBeInTheDocument();
	});
});
