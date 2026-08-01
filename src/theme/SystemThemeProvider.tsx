import { type ReactNode, useEffect } from "react";

const darkSchemeQuery = "(prefers-color-scheme: dark)";

/**
 * Keeps the document's `color-scheme` attribute in step with the operating
 * system preference.
 *
 * `public/theme.js` sets the same attribute before first paint so the correct
 * scheme is applied without a flash; this provider only handles changes made
 * while the application is running. Replace it if the product introduces a
 * reviewed, persisted user preference — but do not pin the page to one scheme.
 */
export function SystemThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
	useEffect(() => {
		const preference = window.matchMedia(darkSchemeQuery);
		const applySystemScheme = () => {
			document.documentElement.setAttribute("color-scheme", preference.matches ? "dark" : "light");
		};

		applySystemScheme();
		preference.addEventListener("change", applySystemScheme);
		return () => preference.removeEventListener("change", applySystemScheme);
	}, []);

	return children;
}
