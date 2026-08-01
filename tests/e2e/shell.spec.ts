import { expect, test } from "@playwright/test";

/**
 * These run against `vite preview`, which loads the development proxy in fixture
 * mode. No credentials and no network access are required.
 */

test("renders the shell with strict headers and no browser errors", async ({ page }) => {
	const browserErrors: string[] = [];
	page.on("pageerror", (error) => browserErrors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") browserErrors.push(message.text());
	});

	const response = await page.goto("/");

	// The name comes from public/config.json, validated before React mounts.
	await expect(page).toHaveTitle("Example module");
	expect(response?.headers()["content-security-policy"]).toContain("default-src 'none'");
	expect(response?.headers()["content-security-policy"]).toContain("connect-src 'self'");
	expect(response?.headers()["cross-origin-opener-policy"]).toBe("same-origin");
	expect(response?.headers()["permissions-policy"]).toContain("camera=()");
	await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
	await expect(page.getByRole("main")).toBeVisible();
	expect(browserErrors).toEqual([]);
});

test("loads the classification catalog and filters by file contents", async ({ page }) => {
	await page.goto("/");

	await expect(
		page.getByRole("heading", { name: "Search by what is inside the file", level: 1 }),
	).toBeVisible();

	// Scoped to the filter bar: several column headers share a name with a filter.
	const filterBar = page.locator(".filter-bar");
	// The filter vocabulary comes from GET /api/v1/classifications.
	const annotatorFilter = filterBar.getByRole("button", { name: /^Sensitive data/ });
	await annotatorFilter.click();
	const creditCard = filterBar.getByRole("checkbox", { name: /Credit card/ });
	await expect(creditCard).toBeVisible();
	await creditCard.check();

	// The compiled query is visible before anything is sent.
	await expect(page.getByText('annotators.name:"Credit card"', { exact: true })).toBeVisible();

	await annotatorFilter.press("Escape");
	await expect(annotatorFilter).toBeFocused();
	await expect(annotatorFilter).toHaveAttribute("aria-expanded", "false");
	// The count is spoken as part of the accessible name, not as a bare number.
	await expect(annotatorFilter).toHaveAccessibleName("Sensitive data, 1 selected");

	await page.getByRole("button", { name: "Apply filters" }).click();

	// Two fixture files contain credit card numbers, neither named "card".
	const rows = page.locator(".data-table tbody tr");
	await expect(rows).toHaveCount(2);
	await expect(page.getByRole("rowheader", { name: "Q1-supplier-invoices.xlsx" })).toBeVisible();
	await expect(page.getByText(/rows read, not a total/)).toBeVisible();
});

test("opens a file detail panel without a further request", async ({ page }) => {
	const fileRequests: string[] = [];
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (url.pathname.startsWith("/api/v1/files")) fileRequests.push(url.pathname + url.search);
	});

	await page.goto("/");
	const filterBar = page.locator(".filter-bar");
	await filterBar.getByRole("button", { name: "Label", exact: true }).click();
	await filterBar.getByRole("checkbox", { name: /Legal hold/ }).check();
	await filterBar.getByRole("button", { name: "Done" }).click();
	await filterBar.getByRole("button", { name: "Apply filters" }).click();

	await expect(page.locator(".data-table tbody tr")).toHaveCount(2);
	const requestsBeforeOpen = fileRequests.length;

	const fileButton = page.getByRole("button", { name: "master-services-agreement.pdf" });
	await fileButton.click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(
		dialog.getByRole("heading", { name: "master-services-agreement.pdf" }),
	).toBeVisible();
	// Every field shown came from the already-streamed row.
	expect(fileRequests.length).toBe(requestsBeforeOpen);

	await dialog.getByRole("button", { name: "Metadata" }).click();
	await expect(dialog.getByText("5PVZRulGAt-h4n5iZsO3")).toBeVisible();
	await dialog.getByRole("button", { name: "Access" }).click();
	await expect(dialog.getByText("Legal Team")).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
});

test("warns that an unfiltered search returns truncated results", async ({ page }) => {
	await page.goto("/");

	// With no filters the query is match-all, which the API truncates.
	await expect(page.getByText("No filters selected")).toBeVisible();
	await page.getByRole("button", { name: "Search" }).click();

	await expect(page.getByText("These results are incomplete")).toBeVisible();
	await expect(page.getByText(/unknown fraction of the matches/)).toBeVisible();
});

test("rejects an invalid hand-written query before sending it", async ({ page }) => {
	const fileRequests: string[] = [];
	page.on("request", (request) => {
		if (new URL(request.url()).pathname === "/api/v1/files") fileRequests.push(request.url());
	});

	await page.goto("/");
	await page.getByRole("button", { name: "Edit query" }).click();

	const editor = page.getByRole("textbox", { name: "Query" });
	await editor.fill("size:>=1000 and fileName:report");
	await page.getByRole("button", { name: "Run query" }).click();

	await expect(page.getByText("This query would be rejected")).toBeVisible();
	await expect(page.getByText(/Comparisons take no colon/)).toBeVisible();
	await expect(page.getByText(/must be uppercase/)).toBeVisible();
	// Both unquoted values are reported, not just the first.
	await expect(page.getByText(/must be double-quoted/)).toHaveCount(2);
	// Nothing was sent: the validator ran client-side.
	expect(fileRequests).toEqual([]);

	await editor.fill('size >= 1000 AND fileName:"*report*"');
	await page.getByRole("button", { name: "Run query" }).click();
	await expect(page.getByText("This query would be rejected")).toBeHidden();
	expect(fileRequests).toHaveLength(1);
});

test("sorts results client-side and exposes sort state accessibly", async ({ page }) => {
	await page.goto("/");
	const filterBar = page.locator(".filter-bar");
	await filterBar.getByRole("button", { name: "Domain", exact: true }).click();
	await filterBar.getByRole("checkbox", { name: /^PII/ }).check();
	await filterBar.getByRole("button", { name: "Done" }).click();
	await filterBar.getByRole("button", { name: "Apply filters" }).click();

	await expect(page.locator(".data-table tbody tr").first()).toBeVisible();
	const sizeHeader = page.getByRole("columnheader", { name: "Size" });
	await expect(sizeHeader).toHaveAttribute("aria-sort", "none");
	await sizeHeader.getByRole("button").click();
	await expect(sizeHeader).toHaveAttribute("aria-sort", "ascending");
	await sizeHeader.getByRole("button").click();
	await expect(sizeHeader).toHaveAttribute("aria-sort", "descending");
});

test("demonstrates sidebar, top, and minimal navigation shells", async ({ page }) => {
	await page.goto("/#shells");

	await expect(page.getByRole("heading", { name: "Shells", level: 1 })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Sidebar navigation" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Top navigation" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Minimal masthead" })).toBeVisible();

	const sidebarNavigation = page.getByRole("navigation", { name: "Sidebar example navigation" });
	await expect(sidebarNavigation.getByRole("link", { name: "Overview" })).toHaveAttribute(
		"aria-current",
		"page",
	);

	const topNavigation = page.getByRole("navigation", { name: "Top example navigation" });
	const overviewTab = topNavigation.getByRole("button", { name: "Overview" });
	const resultsTab = topNavigation.getByRole("button", { name: "Results" });
	await expect(overviewTab).toHaveAttribute("aria-current", "true");
	await resultsTab.click();
	await expect(resultsTab).toHaveAttribute("aria-current", "true");
	await expect(overviewTab).not.toHaveAttribute("aria-current", "true");
});

test("uses an explicit small-screen navigation menu without horizontal overflow", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");

	const primaryNavigation = page.getByRole("navigation", { name: "Primary" });
	const applicationSidebar = page.getByRole("complementary", { name: "Application" });
	const openButton = applicationSidebar.getByRole("button", { name: "Open navigation" });

	await expect(openButton).toHaveAttribute("aria-expanded", "false");
	await expect(primaryNavigation).toBeHidden();

	await openButton.click();
	await expect(primaryNavigation).toBeVisible();
	await page.getByRole("link", { name: "Shells" }).click();
	await expect(page).toHaveURL(/#shells$/);
	await expect(page.getByRole("heading", { name: "Shells", level: 1 })).toBeVisible();

	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
		),
	).toBe(true);
});

test("follows the OS colour scheme and collapses navigation accessibly", async ({ page }) => {
	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/");

	await expect(page.locator("html")).toHaveAttribute("color-scheme", "dark");
	const darkBackground = await page
		.locator("body")
		.evaluate((element) => getComputedStyle(element).backgroundColor);

	await page.emulateMedia({ colorScheme: "light" });
	await expect(page.locator("html")).toHaveAttribute("color-scheme", "light");
	const lightBackground = await page
		.locator("body")
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	expect(lightBackground).not.toBe(darkBackground);

	await page.getByRole("button", { name: "Collapse navigation" }).click();
	await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Files" })).toHaveAttribute("aria-current", "page");
});
