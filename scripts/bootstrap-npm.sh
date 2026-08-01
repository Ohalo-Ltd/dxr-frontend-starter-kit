#!/bin/sh
set -eu

version="12.0.1"
expected="L5T9i/YAQWQWqTS/xZxJkei/9zcu99hCeE4qi41IyBVV7mRQad3qc2JfuOktwmH+qwGI/V2rbCL+/UYxb1+RQA=="
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM

npm pack "npm@${version}" \
	--ignore-scripts \
	--loglevel=error \
	--pack-destination "$work_dir" >/dev/null

tarball="$work_dir/npm-${version}.tgz"
actual="$(node -e 'process.stdout.write(require("node:crypto").createHash("sha512").update(require("node:fs").readFileSync(process.argv[1])).digest("base64"))' "$tarball")"

if [ "$actual" != "$expected" ]; then
	echo "npm bootstrap integrity verification failed" >&2
	exit 1
fi

npm install --global "$tarball" --ignore-scripts --no-audit --no-fund
npm --version
