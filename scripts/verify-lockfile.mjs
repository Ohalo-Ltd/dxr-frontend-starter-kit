import { readFile } from "node:fs/promises";
import process from "node:process";

const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const failures = [];
const rootPackage = lock.packages?.[""];
const publicRegistry = "https://registry.npmjs.org/";
const reviewedOptionalInstallScripts = new Map([
	["node_modules/fsevents", "2.3.2"],
	["node_modules/vite/node_modules/fsevents", "2.3.3"],
]);

if (lock.lockfileVersion !== 3) {
	failures.push(`package-lock.json must use lockfileVersion 3, found ${lock.lockfileVersion}`);
}

if (rootPackage === undefined) {
	failures.push("package-lock.json has no root package");
}
if (lock.name !== manifest.name || rootPackage?.name !== manifest.name) {
	failures.push("package-lock.json root name does not match package.json");
}
if (lock.version !== manifest.version || rootPackage?.version !== manifest.version) {
	failures.push("package-lock.json root version does not match package.json");
}
if (rootPackage?.engines?.node !== manifest.engines?.node) {
	failures.push("package-lock.json root Node engine does not match package.json");
}
if (rootPackage?.engines?.npm !== manifest.engines?.npm) {
	failures.push("package-lock.json root npm engine does not match package.json");
}

for (const group of ["dependencies", "devDependencies"]) {
	for (const [name, version] of Object.entries(manifest[group] ?? {})) {
		if (rootPackage?.[group]?.[name] !== version) {
			failures.push(`package.json ${group}.${name} is missing or changed in package-lock.json`);
		}
	}
	for (const [name, version] of Object.entries(rootPackage?.[group] ?? {})) {
		if (manifest[group]?.[name] !== version) {
			failures.push(`package-lock.json ${group}.${name} does not match package.json`);
		}
		if (
			typeof version !== "string" ||
			/^[~^*]|^(?:git|github|https?|file|link|workspace):/u.test(version)
		) {
			failures.push(`${group}.${name} must be an exact registry version, found ${version}`);
		}
	}
}

for (const [path, pkg] of Object.entries(lock.packages ?? {})) {
	if (path === "" || pkg.link === true) {
		continue;
	}

	// Every dependency must come from the public npm registry. This starter has no
	// private or scoped registry, so there is no exception to make here.
	if (typeof pkg.resolved !== "string" || !pkg.resolved.startsWith(publicRegistry)) {
		failures.push(`${path} resolves outside the public npm registry: ${String(pkg.resolved)}`);
	}
	if (typeof pkg.integrity !== "string" || !pkg.integrity.startsWith("sha512-")) {
		failures.push(`${path} is not protected by a SHA-512 integrity value`);
	}
	if (pkg.hasInstallScript === true) {
		const reviewedVersion = reviewedOptionalInstallScripts.get(path);
		const isReviewedOptionalDarwinDevDependency =
			pkg.version === reviewedVersion &&
			pkg.optional === true &&
			pkg.dev === true &&
			Array.isArray(pkg.os) &&
			pkg.os.length === 1 &&
			pkg.os[0] === "darwin";
		if (!isReviewedOptionalDarwinDevDependency) {
			failures.push(
				`${path} declares an install script; remove it or add an exact reviewed exception`,
			);
		}
	}
}

for (const [path, version] of reviewedOptionalInstallScripts) {
	if (lock.packages?.[path]?.version !== version) {
		failures.push(
			`${path}@${version} install-script exception is stale; review the lock and policy`,
		);
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

console.log("Dependency lock policy passed.");
