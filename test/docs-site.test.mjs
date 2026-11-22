import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = join(import.meta.dirname, "../tools/docs-site.mjs");

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "docs-site-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return cwd;
}

function scan(cwd, path) {
  return spawnSync(process.execPath, [script, "--csp-hashes", path], {
    cwd,
    encoding: "utf8",
  });
}

test("CSP scan accepts a directory inside the working directory", (t) => {
  const cwd = fixture(t);
  mkdirSync(join(cwd, "site"));
  writeFileSync(join(cwd, "site/index.html"), "<script>safe()</script>");
  const result = scan(cwd, "site");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sha256-/);
});

test("CSP scan rejects paths outside the working directory", (t) => {
  const cwd = fixture(t);
  const result = scan(cwd, "../outside");
  assert.notEqual(result.status, 0);
});

test("CSP scan rejects a root symlink pointing outside the working directory", (t) => {
  const cwd = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "docs-site-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(cwd, "site"));
  const result = scan(cwd, "site");
  assert.notEqual(result.status, 0);
});

test("CSP scan does not read HTML files through symlinks", (t) => {
  const cwd = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "docs-site-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  mkdirSync(join(cwd, "site"));
  writeFileSync(join(outside, "secret.html"), "<script>outsideSecret()</script>");
  symlinkSync(join(outside, "secret.html"), join(cwd, "site/secret.html"));
  const result = scan(cwd, "site");
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /sha256-/);
});
