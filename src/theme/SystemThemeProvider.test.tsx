import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemThemeProvider } from "./SystemThemeProvider";

describe("SystemThemeProvider", () => {
	afterEach(() => {
		document.documentElement.removeAttribute("color-scheme");
		vi.unstubAllGlobals();
	});

	it("uses the OS scheme and follows changes", () => {
		let isDark = true;
		const listeners = new Set<() => void>();
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({
				get matches() {
					return isDark;
				},
				media: "(prefers-color-scheme: dark)",
				onchange: null,
				addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
				removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
				addListener: () => {},
				removeListener: () => {},
				dispatchEvent: () => true,
			})),
		);

		render(
			<SystemThemeProvider>
				<span>Content</span>
			</SystemThemeProvider>,
		);
		expect(document.documentElement).toHaveAttribute("color-scheme", "dark");

		act(() => {
			isDark = false;
			for (const listener of listeners) listener();
		});
		expect(document.documentElement).toHaveAttribute("color-scheme", "light");
	});
});
