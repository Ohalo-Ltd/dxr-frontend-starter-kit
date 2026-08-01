import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRuntimeConfig, parseRuntimeConfig } from "./runtimeConfig";

describe("parseRuntimeConfig", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("accepts a module brand", () => {
		expect(parseRuntimeConfig({ appName: "Review module", brand: { mode: "module" } })).toEqual({
			appName: "Review module",
			brand: { mode: "module" },
		});
	});

	it("accepts a same-origin customer logo", () => {
		expect(
			parseRuntimeConfig({
				appName: "Customer review",
				brand: {
					mode: "customer",
					customerName: "Example customer",
					customerLogoPath: "/branding/customer-logo.svg",
				},
			}),
		).toEqual({
			appName: "Customer review",
			brand: {
				mode: "customer",
				customerName: "Example customer",
				customerLogoPath: "/branding/customer-logo.svg",
			},
		});
	});

	it.each([
		undefined,
		{},
		{ appName: "", brand: { mode: "module" } },
		{ appName: "Module", brand: { mode: "unknown" } },
		{ appName: "Module", brand: { mode: "module" }, unexpected: true },
		{
			appName: "Module",
			brand: {
				mode: "customer",
				customerName: "Customer",
				customerLogoPath: "https://example.test/logo.svg",
			},
		},
		{
			appName: "Module",
			brand: {
				mode: "customer",
				customerName: "Customer",
				customerLogoPath: "/branding/../secret",
			},
		},
		{
			appName: "Module",
			brand: {
				mode: "customer",
				customerName: "Customer",
				customerLogoPath: "/branding/%2e%2e/secret.svg",
			},
		},
	])("rejects malformed or unsafe configuration %#", (value) => {
		expect(() => parseRuntimeConfig(value)).toThrow("Invalid runtime configuration");
	});

	it("loads a bounded same-origin JSON response", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ appName: "Review module", brand: { mode: "module" } }), {
				headers: { "Content-Type": "application/json; charset=utf-8" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(loadRuntimeConfig()).resolves.toEqual({
			appName: "Review module",
			brand: { mode: "module" },
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"/config.json",
			expect.objectContaining({
				cache: "no-store",
				credentials: "same-origin",
				redirect: "error",
				signal: expect.any(AbortSignal),
			}),
		);
	});

	it("rejects an oversized configuration before reading it", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response("{}", {
					headers: {
						"Content-Length": "16385",
						"Content-Type": "application/json",
					},
				}),
			),
		);

		await expect(loadRuntimeConfig()).rejects.toThrow("Runtime configuration is unavailable");
	});

	it("rejects a non-JSON configuration response", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response("<html></html>", { headers: { "Content-Type": "text/html" } }),
				),
		);

		await expect(loadRuntimeConfig()).rejects.toThrow("Runtime configuration is unavailable");
	});

	it("rejects a streamed response that crosses the byte limit", async () => {
		const oversizedBody = `${" ".repeat(16_384)}{"appName":"Module","brand":{"mode":"module"}}`;
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(oversizedBody, {
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		await expect(loadRuntimeConfig()).rejects.toThrow("Runtime configuration is unavailable");
	});

	it("aborts a configuration request that exceeds the time limit", async () => {
		vi.useFakeTimers();
		let requestSignal: AbortSignal | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn((_input, init) => {
				requestSignal = init?.signal ?? undefined;
				return new Promise<Response>((_resolve, reject) => {
					requestSignal?.addEventListener("abort", () => {
						reject(new DOMException("Aborted", "AbortError"));
					});
				});
			}),
		);

		const expectation = expect(loadRuntimeConfig()).rejects.toThrow("Aborted");
		await vi.advanceTimersByTimeAsync(5_000);
		await expectation;
		expect(requestSignal?.aborted).toBe(true);
	});
});
