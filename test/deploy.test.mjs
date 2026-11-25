
// tools/deploy.sh remains the local/manual deployment path. Workers Builds
// prepares the same placeholders through setup.mjs before Wrangler deploys.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const declared = [
  ...readFileSync(join(root, "cloudflare.example.env"), "utf8").matchAll(/^([A-Z][A-Z0-9_]*)=/gm),
].map((match) => match[1]);

// Runs deploy.sh with an npm stand-in, so nothing is installed or uploaded.
// The stand-in records where and how wrangler was called.
function deploy(args, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-test-"));
  const log = join(dir, "log");
  writeFileSync(
    join(dir, "npm"),
    '#!/bin/sh\nif [ "$1" = "ci" ]; then exit 0; fi\nif [ "$1" = "run" ] && [ "$2" = "--silent" ] && [ "$3" = "--workspace" ] && [ "$4" = "@workoholic/web" ] && [ "$5" = "wrangler" ] && [ "$6" = "--" ]; then shift 6; set -- wrangler "$@"; fi\n{ pwd; echo "$*"; } >>"$DEPLOY_LOG"\ncp wrangler.jsonc "$DEPLOY_LOG.jsonc"\necho "${CLOUDFLARE_ACCOUNT_ID:-}" >"$DEPLOY_LOG.account"\n',
    { mode: 0o755 },
  );
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !declared.includes(name) && !name.startsWith("CLOUDFLARE_")),
  );
  const result = spawnSync("sh", [join(root, "tools/deploy.sh"), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...clean, ...env, TMPDIR: tmpdir(), PATH: `${dir}:${process.env.PATH}`, DEPLOY_LOG: log },
  });
  const called = existsSync(log);
  const lines = called ? readFileSync(log, "utf8").trimEnd().split("\n") : [];
  const config = called ? readFileSync(`${log}.jsonc`, "utf8") : "";
  const account = called ? readFileSync(`${log}.account`, "utf8").trim() : "";
  rmSync(dir, { recursive: true, force: true });
  return {
    status: result.status,
    stderr: result.stderr,
    called,
    cwd: lines[0],
    commands: lines.filter((_, index) => index % 2 === 1),
    config,
    account,
  };
}

// A values file of your own: the example values followed by extra lines.
function valuesFile(t, ...extra) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-values-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "values.env");
  const example = readFileSync(join(root, "cloudflare.example.env"), "utf8");
  writeFileSync(file, [example, ...extra, ""].join("\n"));
  return file;
}

test("applies migrations and deploys a filled-in temporary copy, then removes it", (t) => {
  const run = deploy([valuesFile(t, `CF_ACCESS_AUD=${"a".repeat(64)}`)]);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.commands, ["wrangler d1 migrations apply DB --remote", "wrangler deploy"]);
  assert.match(run.config, /"pattern": "app\.example\.com"/);
  assert.doesNotMatch(run.config, /__[A-Z][A-Z0-9_]*__/);
  assert.ok(!run.cwd.startsWith(root), "the copy must live outside the repo");
  assert.ok(!existsSync(run.cwd), "the copy must be removed afterwards");
});

test("a dry run passes the flag on and leaves the database alone", () => {
  const run = deploy(["cloudflare.example.env", "--dry-run"]);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.commands, ["wrangler deploy --dry-run"]);
});

test("takes the values from the environment and treats unset names as empty", () => {
  const run = deploy(["--dry-run"], {
    PUBLIC_HOST: "app.example.net",
    D1_DATABASE_NAME: "jobs",
    D1_DATABASE_ID: "11111111-1111-1111-1111-111111111111",
    SECRETS_STORE_ID: "22222222222222222222222222222222",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.commands, ["wrangler deploy --dry-run"]);
  assert.match(run.config, /"pattern": "app\.example\.net"/);
  assert.match(run.config, /"database_id": "11111111-1111-1111-1111-111111111111"/);
  assert.doesNotMatch(run.config, /__[A-Z][A-Z0-9_]*__/);
});

test("refuses to deploy without a Secrets Store for the configuration key", () => {
  const run = deploy([], {
    PUBLIC_HOST: "app.example.net",
    CF_ACCESS_TEAM_DOMAIN: "team.example.net",
    CF_ACCESS_AUD: "a".repeat(64),
  });
  assert.equal(run.status, 1);
  assert.equal(run.called, false);
  assert.match(run.stderr, /SECRETS_STORE_ID is empty/);
});

test("refuses to deploy without any values", () => {
  const run = deploy([]);
  assert.equal(run.status, 1);
  assert.equal(run.called, false);
  assert.match(run.stderr, /No values found/);
});

test("refuses a values file that does not exist", () => {
  const run = deploy(["missing.env"]);
  assert.equal(run.status, 1);
  assert.equal(run.called, false);
  assert.match(run.stderr, /No such values file/);
});

test("hands the Cloudflare account in a values file, or in a file it names, to wrangler", (t) => {
  const file = valuesFile(t, `CLOUDFLARE_ACCOUNT_ID=${"1".repeat(32)}`);
  assert.equal(deploy([file, "--dry-run"]).account, "1".repeat(32));
  const preset = deploy([file, "--dry-run"], { CLOUDFLARE_ACCOUNT_ID: "2".repeat(32) });
  assert.equal(preset.account, "2".repeat(32));
  const named = valuesFile(t, "CLOUDFLARE_ACCOUNT_ID=@account.txt");
  writeFileSync(join(dirname(named), "account.txt"), `${"3".repeat(32)}\r\n`);
  assert.equal(deploy([named, "--dry-run"]).account, "3".repeat(32));
});

test("refuses to upload without the Cloudflare Access values", (t) => {
  const run = deploy(["cloudflare.example.env"]);
  assert.equal(run.status, 1);
  assert.equal(run.called, false);
  assert.match(run.stderr, /CF_ACCESS_AUD is empty/);
  const filled = deploy([valuesFile(t, `CF_ACCESS_AUD=${"a".repeat(64)}`)]);
  assert.equal(filled.status, 0, filled.stderr);
});

test("Workers Builds performs resource setup and migrations in the deploy phase", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const setup = readFileSync(join(root, "tools/setup.mjs"), "utf8");
  const renderer = readFileSync(join(root, "tools/render.mjs"), "utf8");
  const configSources = [
    "wrangler.jsonc",
    "apps/web/src/runtime-config.ts",
    "apps/web/src/auth-ui.ts",
    "apps/web/public/index.html",
    "apps/web/public/assets/dashboard.js",
  ].map((file) => readFileSync(join(root, file), "utf8")).join("\\n");
  assert.equal(packageJson.scripts.postinstall, undefined, "setup must not run during npm install");
  assert.equal(lock.packages[""].hasInstallScript, undefined, "lockfile must not advertise an install script");
  assert.match(setup, /const BUILD_COMMAND = "npm ci --legacy-peer-deps"/);
  assert.match(setup, /const DEPLOY_COMMAND = "node tools\/setup\.mjs --workers-build && npm exec -- wrangler deploy"/);
  assert.match(setup, /CLOUDFLARE_API_TOKEN/);
  assert.match(setup, /\/d1\/database/);
  assert.match(setup, /\/secrets_store\/stores/);
  assert.match(setup, /\/storage\/kv\/namespaces/);
  assert.match(setup, /values\/settings/);
  assert.match(setup, /tools\/render\.mjs/);
  assert.match(setup, /const renderDir = "build"/);
  assert.match(setup, /cpSync\(renderDir, root/);
  assert.ok(setup.indexOf('cpSync(renderDir, root') < setup.indexOf('wrangler(["d1", "migrations", "apply"'));
  assert.match(renderer, /readKvValues/);
  assert.match(renderer, /settings/);
  for (const name of declared) assert.ok(configSources.includes(`__${name}__`), name + " placeholder is missing from Worker configuration sources");
});
