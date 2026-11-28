// The repository follows the Ubuntu LTS. Toolchains come from the Ubuntu APT
// repositories as unversioned packages: within a release the package list is
// frozen, so they give the series the release ships, and the next release's
// series on their own when GitHub moves ubuntu-latest.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const workflowDir = join(root, ".github", "workflows");
const workflows = readdirSync(workflowDir)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => [file, readFileSync(join(workflowDir, file), "utf8")]);

// A package name that carries a version, such as python3.14, rustc-1.93 or nodejs-22.
const versioned = /(^|[^a-z])(python3\.[0-9]+|rustc?-[0-9.]+|cargo-[0-9.]+|nodejs-[0-9]+|openjdk-[0-9]+)/;

test("Ubuntu jobs run on the latest Ubuntu runner", () => {
  for (const [file, text] of workflows) {
    for (const [, label] of text.matchAll(/runs-on:\s*(\S+)/g)) {
      assert.equal(label, "ubuntu-latest", `${file} runs on ${label}`);
    }
  }
});

test("the toolchain script only accepts packages from the Ubuntu archive", () => {
  const script = readFileSync(join(root, ".github", "scripts", "ubuntu-toolchain.sh"), "utf8");
  assert.match(script, /apt-get update/);
  assert.match(script, /was not installed from the Ubuntu archive/);
});

test("toolchains are not installed from outside the Ubuntu archive", () => {
  for (const [file, text] of workflows) {
    assert.doesNotMatch(text, /actions\/setup-(node|python)|rust-toolchain/, `${file} installs a toolchain with an action`);
  }
});

test("toolchain packages are unversioned, so they follow the Ubuntu release", () => {
  let packages = 0;
  for (const [file, text] of workflows) {
    for (const [, args] of text.matchAll(/ubuntu-toolchain\.sh\s+(.+)/g)) {
      for (const token of args.split(/\s+/)) {
        assert.doesNotMatch(token, /=/, `${file}: ${token} pins a version`);
        assert.doesNotMatch(token, versioned, `${file}: ${token} names a version`);
        packages += 1;
      }
    }
  }
  assert.ok(packages > 0);
});

test("the container image follows the latest Ubuntu LTS by digest with unversioned Node", () => {
  const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
  assert.match(dockerfile, /^FROM ubuntu:latest@sha256:[0-9a-f]{64}$/m);
  const install = dockerfile.match(/apt-get install[^\n]*/)?.[0] ?? "";
  assert.match(install, /\bnodejs\b/);
  assert.match(dockerfile, /apt-get update && apt-get upgrade -y && apt-get install/, "the build must apply Ubuntu's maintenance and security fixes");
  assert.doesNotMatch(install, /=/);
  assert.doesNotMatch(install, versioned);
});

test("Renovate leaves the toolchains to APT", () => {
  const rules = JSON.parse(readFileSync(join(root, "renovate.json"), "utf8")).packageRules;
  const toolchains = rules.find((rule) => rule.matchPackageNames?.includes("node"));
  assert.ok(toolchains && toolchains.enabled === false);
});

test("the baseline is documented for agents and linked from AGENTS.md", () => {
  const doc = readFileSync(join(root, "docs", "agents", "ubuntu-baseline.md"), "utf8");
  assert.match(doc, /unversioned/i);
  assert.match(doc, /ubuntu-latest/);
  assert.match(readFileSync(join(root, "AGENTS.md"), "utf8"), /docs\/agents\/ubuntu-baseline\.md/);
});
