import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const script = join(root, "tools/mergify-junit.py");

function normalize(t, xml, ...args) {
  const dir = mkdtempSync(join(tmpdir(), "mergify-junit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "junit.xml"), xml);
  const result = spawnSync("python3", [script, ...args], { cwd: dir, encoding: "utf8" });
  return { ...result, xml: readFileSync(join(dir, "junit.xml"), "utf8") };
}

test("wraps only direct test cases and ignores tag-like text in diagnostic comments", (t) => {
  const input = '<testsuites><!-- diagnostic: <testsuite><testcase/><failure/></testsuite> -->' +
    '<testsuite name="existing"><testcase name="nested"/></testsuite>' +
    '<testcase name="passing" time="0.1"/><testcase name="failing" time="0.2"><failure/></testcase>' +
    '</testsuites>';
  const result = normalize(t, input);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.xml, /<!-- diagnostic: <testsuite><testcase\/><failure\/><\/testsuite> -->/);
  assert.match(result.xml, /<testsuite name="node:test" tests="2" failures="1" errors="0" skipped="0" time="0\.300000">/);
  assert.match(result.xml, /<testsuite name="existing"><testcase name="nested" \/><\/testsuite>/);
  const withoutComments = result.xml.replace(/<!--[\s\S]*?-->/g, "");
  assert.equal((withoutComments.match(/<testcase\b/g) ?? []).length, 3);
});

test("leaves an already nested report unchanged", (t) => {
  const input = '<?xml version="1.0"?><testsuites><testsuite name="existing"><testcase name="one"/></testsuite></testsuites>';
  const result = normalize(t, input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.xml, input);
});

test("never accepts a report path from a command-line argument", (t) => {
  const result = normalize(t, '<testsuites><testcase name="safe"/></testsuites>', "../../outside.xml");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.xml, /name="safe"/);
});
