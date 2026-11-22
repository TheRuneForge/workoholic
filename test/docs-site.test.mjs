import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

function scan(cwd, extraArg) {
  const args = [script, "--csp-hashes"];
  if (extraArg) args.push(extraArg);
  return spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
}

function hash(code) {
  return `'sha256-${createHash("sha256").update(code).digest("base64")}'`;
}

test("CSP scan hashes inline scripts in site", (t) => {
  const cwd = fixture(t);
  mkdirSync(join(cwd, "site"));
  writeFileSync(join(cwd, "site/index.html"), "<script>safe()</script>");
  const result = scan(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(hash("safe()")));
});

test("CSP scan ignores CLI paths outside site", (t) => {
  const cwd = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "docs-site-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  mkdirSync(join(cwd, "site"));
  writeFileSync(join(cwd, "site/index.html"), "<script>inside()</script>");
  writeFileSync(join(outside, "secret.html"), "<script>outsideSecret()</script>");
  const result = scan(cwd, outside);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(hash("inside()")));
  assert.ok(!result.stdout.includes(hash("outsideSecret()")));
});

test("CSP scan does not read HTML through a root symlink outside site", (t) => {
  const cwd = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "docs-site-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "secret.html"), "<script>outsideSecret()</script>");
  symlinkSync(outside, join(cwd, "site"));
  const result = scan(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(hash("outsideSecret()")));
});

test("CSP scan does not read HTML files through nested symlinks", (t) => {
  const cwd = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "docs-site-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  mkdirSync(join(cwd, "site"));
  writeFileSync(join(outside, "secret.html"), "<script>outsideSecret()</script>");
  symlinkSync(join(outside, "secret.html"), join(cwd, "site/secret.html"));
  const result = scan(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(hash("outsideSecret()")));
});
