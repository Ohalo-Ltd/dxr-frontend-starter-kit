import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const denied = /\b(?:AGPL|GPL|SSPL|BUSL|Commons-Clause)\b/iu;
const failures = [];
const pendingNodeModules = [fileURLToPath(new URL("../node_modules", import.meta.url))];

async function packageDirectories(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const directories = [];

	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith(".")) {
			continue;
		}

		const entryPath = path.join(directory, entry.name);
		if (entry.name.startsWith("@")) {
			for (const scopedEntry of await readdir(entryPath, { withFileTypes: true })) {
				if (scopedEntry.isDirectory()) {
					directories.push(path.join(entryPath, scopedEntry.name));
				}
			}
		} else {
			directories.push(entryPath);
		}
	}

	return directories;
}

while (pendingNodeModules.length > 0) {
	const nodeModules = pendingNodeModules.pop();
	if (nodeModules === undefined) {
		break;
	}

	for (const directory of await packageDirectories(nodeModules)) {
		try {
			const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
			const license =
				typeof manifest.license === "string"
					? manifest.license
					: Array.isArray(manifest.licenses)
						? manifest.licenses
								.map((item) => item?.type)
								.filter(Boolean)
								.join(" OR ")
						: "";
			// Every dependency is a public package, so missing license metadata is
			// always a failure. There is no internal-package exemption.
			if (license.length === 0 || denied.test(license)) {
				failures.push(`${manifest.name ?? directory}: ${license || "missing license metadata"}`);
			}

			try {
				await readdir(path.join(directory, "node_modules"));
				pendingNodeModules.push(path.join(directory, "node_modules"));
			} catch {
				// Most npm dependencies are hoisted and have no nested graph.
			}
		} catch (error) {
			failures.push(
				`${directory}: ${error instanceof Error ? error.message : "unreadable manifest"}`,
			);
		}
	}
}

if (failures.length > 0) {
	console.error(`Dependency license policy failed:\n${failures.join("\n")}`);
	process.exit(1);
}

console.log("Dependency license policy passed.");
