export type ModuleBrand = Readonly<{
	mode: "module";
}>;

export type CustomerBrand = Readonly<{
	mode: "customer";
	customerName: string;
	customerLogoPath: string;
}>;

export type RuntimeConfig = Readonly<{
	appName: string;
	brand: ModuleBrand | CustomerBrand;
}>;

const APP_NAME_MAX_LENGTH = 80;
const CUSTOMER_NAME_MAX_LENGTH = 80;
const BRAND_ASSET_PATH_MAX_LENGTH = 256;
const CONFIG_MAX_BYTES = 16_384;
const CONFIG_TIMEOUT_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
	return Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
	return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength;
}

function isSafeAssetPath(value: unknown): value is string {
	if (
		typeof value !== "string" ||
		value.length > BRAND_ASSET_PATH_MAX_LENGTH ||
		!value.startsWith("/branding/") ||
		!/^\/branding\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value)
	) {
		return false;
	}

	return value
		.split("/")
		.every(
			(segment, index) => index === 0 || (segment !== "" && segment !== "." && segment !== ".."),
		);
}

export function parseRuntimeConfig(value: unknown): RuntimeConfig {
	if (
		!isRecord(value) ||
		!hasOnlyKeys(value, new Set(["appName", "brand"])) ||
		!isBoundedText(value.appName, APP_NAME_MAX_LENGTH) ||
		!isRecord(value.brand)
	) {
		throw new Error("Invalid runtime configuration");
	}

	if (value.brand.mode === "module" && hasOnlyKeys(value.brand, new Set(["mode"]))) {
		return {
			appName: value.appName.trim(),
			brand: { mode: "module" },
		};
	}

	if (
		value.brand.mode === "customer" &&
		hasOnlyKeys(value.brand, new Set(["mode", "customerName", "customerLogoPath"])) &&
		isBoundedText(value.brand.customerName, CUSTOMER_NAME_MAX_LENGTH) &&
		isSafeAssetPath(value.brand.customerLogoPath)
	) {
		return {
			appName: value.appName.trim(),
			brand: {
				mode: "customer",
				customerName: value.brand.customerName.trim(),
				customerLogoPath: value.brand.customerLogoPath,
			},
		};
	}

	throw new Error("Invalid runtime configuration");
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
	const controller = new AbortController();
	const timeout = globalThis.setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);

	try {
		const response = await fetch("/config.json", {
			cache: "no-store",
			credentials: "same-origin",
			headers: {
				Accept: "application/json",
			},
			redirect: "error",
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error("Runtime configuration is unavailable");
		}
		if (!response.headers.get("content-type")?.toLocaleLowerCase().startsWith("application/json")) {
			throw new Error("Runtime configuration is unavailable");
		}

		return parseRuntimeConfig(JSON.parse(await readBoundedText(response)));
	} finally {
		globalThis.clearTimeout(timeout);
	}
}

async function readBoundedText(response: Response): Promise<string> {
	const declaredLength = response.headers.get("content-length");
	if (
		declaredLength !== null &&
		(!/^\d+$/u.test(declaredLength) || Number(declaredLength) > CONFIG_MAX_BYTES)
	) {
		throw new Error("Runtime configuration is unavailable");
	}

	if (response.body === null) {
		const text = await response.text();
		if (new TextEncoder().encode(text).byteLength > CONFIG_MAX_BYTES) {
			throw new Error("Runtime configuration is unavailable");
		}
		return text;
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	try {
		while (true) {
			const result = await reader.read();
			if (result.done) break;
			totalBytes += result.value.byteLength;
			if (totalBytes > CONFIG_MAX_BYTES) {
				await reader.cancel();
				throw new Error("Runtime configuration is unavailable");
			}
			chunks.push(result.value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new Error("Runtime configuration is unavailable");
	}
}
