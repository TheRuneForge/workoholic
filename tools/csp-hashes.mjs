#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, realpathSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";

const root = realpathSync.native(process.cwd());
const scanArg = process.argv[2];
if (!scanArg?.trim()) throw new Error("scan directory is required");

const assertWithin = (path, allowedRoot) => {
  const prefix = allowedRoot.endsWith(sep) ? allowedRoot : allowedRoot + sep;
  if (path !== allowedRoot && !path.startsWith(prefix)) {
    throw new Error("scan directory must be within the current working directory");
  }
};

const rejectSymlinkComponents = (absolute) => {
  let current = root;
  for (const component of relative(root, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, component);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error("scan directory must not traverse symbolic links");
      }
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      break;
    }
  }
};

const findExistingAncestor = (absolute) => {
  let existing = absolute;
  const missing = [];
  while (true) {
    try {
      return { canonicalExisting: realpathSync.native(existing), missing };
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      missing.unshift(basename(existing));
      existing = parent;
    }
  }
};

const resolveWithin = (candidate) => {
  if (typeof candidate !== "string" || !candidate.trim() || isAbsolute(candidate) || candidate.split(/[\\/]/).includes("..")) {
    throw new Error("scan directory must be a relative path without parent-directory segments");
  }
  const absolute = resolve(root, candidate);
  assertWithin(absolute, root);
  rejectSymlinkComponents(absolute);
  const { canonicalExisting, missing } = findExistingAncestor(absolute);
  const canonical = resolve(canonicalExisting, ...missing);
  assertWithin(canonical, realpathSync.native(root));
  if (relative(absolute, canonical) !== "") {
    throw new Error("scan directory must not traverse symbolic links");
  }
  return canonical;
};

const scanRoot = resolveWithin(scanArg);
const hashes = new Set();
const scan = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.isFile() && path.endsWith(".html")) {
      for (const [, code] of readFileSync(path, "utf8").matchAll(
        /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g,
      )) {
        if (code) hashes.add("'sha256-" + createHash("sha256").update(code).digest("base64") + "'");
      }
    }
  }
};
scan(scanRoot);
console.log([...hashes].sort((a, b) => a.localeCompare(b)).join(" "));
