#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workflows = ".github/workflows";
const files = readdirSync(workflows, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
  .map((entry) => join(workflows, entry.name));
let count = 0;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const [index, line] of source.split("\n").entries()) {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(.*))?$/);
    if (!match) continue;
    const reference = match[1];
    if (reference.startsWith("./") || reference.startsWith("docker://")) continue;
    const separator = reference.lastIndexOf("@");
    const revision = separator < 0 ? "" : reference.slice(separator + 1);
    if (!/^[0-9a-f]{40}$/.test(revision)) {
      throw new Error(file + ":" + (index + 1) + ": action must be pinned to a full commit SHA: " + reference);
    }
    if (!match[2]?.trim()) {
      throw new Error(file + ":" + (index + 1) + ": add the upstream version as a comment for traceability");
    }
    count += 1;
  }
}
if (count === 0) throw new Error("No external GitHub Actions pins were checked.");
console.log("Verified " + count + " immutable action pins across " + files.length + " workflows.");
