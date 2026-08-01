import { readFile } from "node:fs/promises";
import process from "node:process";
import packageJson from "../package.json" with { type: "json" };

const expectedNode = packageJson.engines.node;
const expectedNpm = packageJson.engines.npm;
const actualNode = process.versions.node;
const npmUserAgent = process.env.npm_config_user_agent ?? "";
const actualNpm = /^npm\/([^ ]+)/u.exec(npmUserAgent)?.[1];
const packageManager = packageJson.packageManager;
const nodeVersionFile = (
	await readFile(new URL("../.node-version", import.meta.url), "utf8")
).trim();
const failures = [];

if (nodeVersionFile !== expectedNode) {
	failures.push(
		`.node-version (${nodeVersionFile}) must match package.json engines.node (${expectedNode})`,
	);
}
if (packageManager !== `npm@${expectedNpm}`) {
	failures.push(
		`packageManager (${String(packageManager)}) must match package.json engines.npm (${expectedNpm})`,
	);
}
if (actualNode !== expectedNode) {
	failures.push(`Node ${expectedNode} is required; found ${actualNode}`);
}
if (actualNpm !== expectedNpm) {
	failures.push(`npm ${expectedNpm} is required; found ${actualNpm ?? "unknown"}`);
}

if (failures.length > 0) {
	console.error(`Toolchain policy failed:\n${failures.join("\n")}`);
	process.exit(1);
}

console.log(`Toolchain policy passed with Node ${actualNode} and npm ${actualNpm}.`);
