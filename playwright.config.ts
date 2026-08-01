import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: false,
	forbidOnly: true,
	retries: 0,
	workers: 1,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:4177",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "off",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "npm run preview -- --port 4177",
		url: "http://127.0.0.1:4177",
		reuseExistingServer: false,
		timeout: 30_000,
	},
});
