import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// @ts-expect-error -- plain JS development-only middleware, intentionally untyped
import { dxrProxy } from "./server/dxrProxy.mjs";

/**
 * The development server needs a nonce because Vite injects an inline module
 * preamble for React Fast Refresh, and inline styles for CSS hot updates.
 *
 * A nonce is used rather than 'unsafe-inline' so the development policy stays a
 * real policy: an injected inline script without the nonce is still blocked.
 * The production policy in deploy/nginx.conf carries no nonce and no inline
 * allowance at all — nothing in the built output needs one.
 */
const developmentNonce = "vite-dev";

function contentSecurityPolicy(nonce?: string): string {
	const inline = nonce === undefined ? "" : ` 'nonce-${nonce}'`;
	return [
		"default-src 'none'",
		`script-src 'self'${inline}`,
		`style-src 'self'${inline}`,
		"img-src 'self' data:",
		"font-src 'self'",
		"connect-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"frame-ancestors 'none'",
		"form-action 'self'",
		"worker-src 'none'",
	].join("; ");
}

const securityHeaders = {
	"Content-Security-Policy": contentSecurityPolicy(),
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Permissions-Policy":
		"camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), usb=()",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
} as const;

const developmentHeaders = {
	...securityHeaders,
	"Content-Security-Policy": contentSecurityPolicy(developmentNonce),
} as const;

export default defineConfig(({ command }) => ({
	// The proxy applies to `dev` and `preview` only. It keeps the API token on the
	// server side so `connect-src 'self'` above needs no relaxation.
	plugins: [react(), dxrProxy()],
	build: {
		sourcemap: false,
		target: "es2022",
	},
	// Only the development server needs the nonce. Keeping it out of the build
	// means the shipped HTML carries no nonce attributes, matching the strict
	// production policy in deploy/nginx.conf.
	...(command === "serve" ? { html: { cspNonce: developmentNonce } } : {}),
	server: {
		host: "127.0.0.1",
		port: 4173,
		strictPort: true,
		headers: developmentHeaders,
	},
	// `preview` serves the real build, so it gets the production policy. The e2e
	// tests run here and assert that policy.
	preview: {
		headers: securityHeaders,
	},
}));
