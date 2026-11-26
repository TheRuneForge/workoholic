import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
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
const cspScript = fileURLToPath(new URL("../tools/csp-hashes.mjs", import.meta.url));

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "docs-site-"));
  copyFileSync(script, join(root, "docs-site.mjs"));
  copyFileSync(cspScript, join(root, "csp-hashes.mjs"));
  writeFileSync(join(root, "README.md"), "# Fixture\n");
  writeFileSync(join(root, "zensical.toml"), 'repo_url = "https://example.test/repo"\n');
  return root;
};

const run = (root, ...args) => {
  const isCsp = args[0] === "--csp-hashes";
  return spawnSync(
    process.execPath,
    [join(root, isCsp ? "csp-hashes.mjs" : "docs-site.mjs"), ...(isCsp ? args.slice(1) : args)],
    { cwd: root, encoding: "utf8" },
  );
};

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
    assert.match(
      result.stderr,
      output === "." ? /within the current working directory/ : /parent-directory segments/,
    );
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
  assert.match(result.stderr, /within the current working directory|must not traverse symbolic links/);
  assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "keep");
  assert.equal(existsSync(join(outside, "generated")), false);
});

test("rejects output paths containing parent segments before normalization", (t) => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "docs-site-parent-segment-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  mkdirSync(join(root, "generated"));
  writeFileSync(join(root, "generated/keep.txt"), "keep");
  symlinkSync(outside, join(root, "linked"), "dir");

  for (const output of ["linked/../generated", "linked\\..\\generated"]) {
    const result = run(root, "--wiki", output);
    assert.notEqual(result.status, 0, output);
    assert.match(result.stderr, /must not contain parent-directory segments/);
    assert.equal(readFileSync(join(root, "generated/keep.txt"), "utf8"), "keep");
  }
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

test("CSP scanning requires an explicit directory argument", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run(root, "--csp-hashes");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scan directory is required/);
});

test("CSP scanning can scan the workspace root", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "index.html"), "<script>root()</script>");

  const result = run(root, "--csp-hashes", ".");
  assert.equal(result.status, 0, result.stderr);
  const rootHash = createHash("sha256").update("root()").digest("base64");
  assert.ok(result.stdout.includes(rootHash));
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

test("refuses to remove source directories as output targets", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs"));
  mkdirSync(join(root, "apps"));
  writeFileSync(join(root, "docs/guide.md"), "# Guide");
  writeFileSync(join(root, "apps/index.ts"), "export {}");

  for (const output of ["docs", "docs/generated", "apps", "tools"]) {
    const result = run(root, "--wiki", output);
    assert.notEqual(result.status, 0, output);
    assert.match(result.stderr, /must not overlap source directories/);
  }
  assert.equal(readFileSync(join(root, "docs/guide.md"), "utf8"), "# Guide");
  assert.equal(readFileSync(join(root, "apps/index.ts"), "utf8"), "export {}");
});

test("refuses to remove Git metadata as the output directory", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, ".git/keep"), "repository metadata");

  const result = run(root, "--wiki", ".git");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not overlap source directories/);
  assert.equal(readFileSync(join(root, ".git/keep"), "utf8"), "repository metadata");
});

test("protects canonical destinations of symlinked source directories", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "content/source"), { recursive: true });
  writeFileSync(join(root, "content/source/guide.md"), "# Guide");
  symlinkSync(join(root, "content/source"), join(root, "docs"), "dir");

  const result = run(root, "--wiki", "content");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not overlap source directories/);
  assert.equal(readFileSync(join(root, "content/source/guide.md"), "utf8"), "# Guide");
});

test("refuses to replace symlink output paths, including dangling symlinks", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "existing"));
  writeFileSync(join(root, "existing/keep.txt"), "keep");
  symlinkSync(join(root, "existing"), join(root, "linked"), "dir");
  symlinkSync(join(root, "missing-target"), join(root, "dangling"), "dir");

  for (const output of ["linked", "dangling", "dangling/generated"]) {
    const result = run(root, "--wiki", output);
    assert.notEqual(result.status, 0, output);
    assert.match(result.stderr, /must not traverse symbolic links/);
  }
  assert.ok(lstatSync(join(root, "linked")).isSymbolicLink());
  assert.ok(lstatSync(join(root, "dangling")).isSymbolicLink());
  assert.equal(readFileSync(join(root, "existing/keep.txt"), "utf8"), "keep");
});
