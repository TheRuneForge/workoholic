import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = fileURLToPath(new URL("../tools/docs-site.mjs", import.meta.url));

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "docs-site-"));
  copyFileSync(script, join(root, "docs-site.mjs"));
  writeFileSync(join(root, "README.md"), "# Fixture\n");
  writeFileSync(join(root, "zensical.toml"), 'repo_url = "https://example.test/repo"\n');
  return root;
};

const run = (root, ...args) =>
  spawnSync(process.execPath, [join(root, "docs-site.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });

test("generates the wiki in a valid nested output directory", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run(root, "--wiki", "generated/wiki");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(root, "generated/wiki/Home.md")));
});

test("refuses the workspace itself, including a normalized missing/.. path", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const marker = join(root, "keep.txt");
  writeFileSync(marker, "keep");

  for (const output of [".", "missing-component/.."]) {
    const result = run(root, "--wiki", output);
    assert.notEqual(result.status, 0, output);
    assert.match(result.stderr, /within the current working directory/);
    assert.equal(readFileSync(marker, "utf8"), "keep");
  }
});

test("rejects an output directory outside the workspace without deleting it", (t) => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "docs-site-outside-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  const marker = join(outside, "keep.txt");
  writeFileSync(marker, "keep");

  const result = run(root, "--wiki", outside);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(marker, "utf8"), "keep");
});

test("does not delete an existing file passed as the output directory", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const marker = join(root, "keep.txt");
  writeFileSync(marker, "keep");

  const result = run(root, "--wiki", "keep.txt");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output path must be a directory/);
  assert.equal(readFileSync(marker, "utf8"), "keep");
});

test("rejects output paths whose existing ancestor is a symlink outside the workspace", (t) => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "docs-site-symlink-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  writeFileSync(join(outside, "keep.txt"), "keep");
  symlinkSync(outside, join(root, "linked"), "dir");

  const result = run(root, "--wiki", "linked/generated");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /within the current working directory/);
  assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "keep");
  assert.equal(existsSync(join(outside, "generated")), false);
});

test("CSP scanning ignores symlinked HTML files", (t) => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "docs-site-csp-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  mkdirSync(join(root, "build"));
  writeFileSync(join(root, "build/inside.html"), "<script>inside()</script>");
  writeFileSync(join(outside, "outside.html"), "<script>outside()</script>");
  symlinkSync(join(outside, "outside.html"), join(root, "build/outside.html"));

  const result = run(root, "--csp-hashes", "build");
  assert.equal(result.status, 0, result.stderr);
  const insideHash = createHash("sha256").update("inside()").digest("base64");
  const outsideHash = createHash("sha256").update("outside()").digest("base64");
  assert.ok(result.stdout.includes(insideHash));
  assert.ok(!result.stdout.includes(outsideHash));
});

test("CSP scanning rejects a directory outside the workspace", (t) => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "docs-site-csp-outside-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  const result = run(root, "--csp-hashes", outside);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /within the current working directory/);
});

test("refuses to replace a symlink used as the output directory", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "existing"));
  writeFileSync(join(root, "existing/keep.txt"), "keep");
  symlinkSync(join(root, "existing"), join(root, "linked"), "dir");

  const result = run(root, "--wiki", "linked");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not be a symbolic link/);
  assert.equal(readFileSync(join(root, "existing/keep.txt"), "utf8"), "keep");
  assert.ok(existsSync(join(root, "linked")));
});
