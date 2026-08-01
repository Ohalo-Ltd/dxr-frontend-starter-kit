import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "happy-dom",
		include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.mjs"],
		setupFiles: ["./src/testing/setup.ts"],
		restoreMocks: true,
	},
});
