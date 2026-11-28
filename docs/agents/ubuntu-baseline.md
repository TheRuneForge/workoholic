# Ubuntu LTS baseline

This page is for coding agents and maintainers. It explains how the repository gets its toolchains, and why. Read it before you touch a runner label, a toolchain install, the Dockerfile base image or the Renovate rules.

## The rule

The repository follows the latest Ubuntu LTS and takes its toolchains from the Ubuntu APT repositories.

- Every job runs on `ubuntu-latest`. Do not write `ubuntu-26.04`, `ubuntu-24.04` or any other fixed label.
- Toolchains are installed with `sh .github/scripts/ubuntu-toolchain.sh <package> ...`, with the **unversioned** package names: `nodejs`, `npm`, `python3`, `python3-venv`, and for Rust `rustc`, `cargo`, `rustfmt`, `rust-clippy`.
- Do not pin a version (`nodejs=22.*`) and do not use a package whose name carries a version (`python3.14`, `rustc-1.93`, `nodejs-22`, `openjdk-25-...`).
- Do not use `actions/setup-node`, `actions/setup-python`, `dtolnay/rust-toolchain` or `oven-sh/setup-bun` to get a toolchain.
- The container image is `FROM ubuntu:latest@sha256:...` and installs the same unversioned packages.

`test/ubuntu-baseline.test.js` enforces this. Do not weaken the test to make a change pass.

## Why

Within an Ubuntu release the package list is frozen. Ubuntu publishes only maintenance and security updates for it (`<release>-updates` and `<release>-security`), not new major versions. So installing an unversioned package gives the version series that release shipped, and only fixes for it afterwards. On 26.04 that is Node 22, Python 3.14 and Rust 1.93.

The same command keeps working when the release changes. When GitHub moves the `ubuntu-latest` label to the next LTS, the unversioned packages resolve to that release's series without any edit. A version pin would not: `nodejs=22.*` stops existing on the next LTS and the build fails at the moment the label moves, on GitHub's schedule and not through a pull request.

There is a window of roughly six months between Ubuntu publishing a new LTS and GitHub moving `ubuntu-latest`. During it the runner stays on the old LTS and so do the packages. The two stay consistent with each other, which is the point of using the runner's own package list.

The Docker base image follows the same idea. `ubuntu:latest` is the latest LTS. It is pinned by digest, and Renovate moves the digest. A new LTS therefore arrives as a pull request, and the image build in CI shows whether the application still works on the new toolchains.

## How updates arrive

The only updates the toolchains take are the ones Ubuntu publishes for the release: maintenance and security fixes from `<release>-updates` and `<release>-security`. That is what `apt update && apt upgrade` and unattended-upgrades install. Renovate does not manage them.

- **CI.** Every run starts with `apt-get update` and installs the packages, so it gets the newest fix available at that moment. Runners are ephemeral, so there is nothing to patch in place and no unattended-upgrades daemon is needed. CI does not run a general `apt-get upgrade`: the runner image has third-party APT sources, and a general upgrade would take updates from them as well. Instead `ubuntu-toolchain.sh` checks after the install that every package came from the Ubuntu archive, and fails if it did not.
- **Container image.** The Dockerfile runs `apt-get update && apt-get upgrade -y` before it installs, so the build contains the fixes published since the base image digest was made. The image is only patched when it is built. A running container is not updated; rebuild and redeploy it to receive fixes. Renovate moves the base image digest.
- **Release changes.** A new LTS is not a maintenance update. It arrives when GitHub moves `ubuntu-latest` and when the base image digest moves to the new release.

## What Ubuntu 26.04 ships

Looked up in the archive (`resolute`, release pocket plus `resolute-updates` and `resolute-security`) when this was written. These are what the unversioned packages resolve to; do not copy them into a pin.

| Package | Version |
|---|---|
| nodejs / npm | 22.22.1 / 9.2.0 |
| python3 | 3.14 (3.14.4 in `resolute-updates`) |
| rustc / cargo / rustfmt / rust-clippy | 1.93.1 |
| golang-go | 1.26 |
| swiftlang | 6.1.3 |
| dotnet-sdk-10.0 | 10.0.105 (10.0.115 in updates) |
| gcc / cmake / git / jq / curl | 15.2 / 4.2.3 / 2.53 / 1.8.1 / 8.18 |
| libgtk-4-dev / libadwaita-1-dev / libgtksourceview-5-dev | 4.22 / 1.9 / 5.18 |
| openjdk | 25 |

To look a package up yourself, read the package index of the suite, for example `https://archive.ubuntu.com/ubuntu/dists/resolute/universe/binary-amd64/Packages.xz`, and the same file under `resolute-updates` and `resolute-security`.

## What is not from Ubuntu

Some tools are not in the Ubuntu archive. They keep their own pinned install and their own update flow in Renovate:

- Wrangler and the other npm dependencies of the workspaces, installed with `npm ci`.
- zensical and its theme, installed with `pip` into a virtual environment. Ubuntu's Python refuses `pip install` outside one (PEP 668).
- `defusedxml` (installed with `pip --target`) and `mergify-cli` (run with `pipx`, version pinned) for the Mergify test reports.
- actionlint, downloaded as a release archive and verified against a pinned checksum.
- The Semgrep and Trivy containers and actions, which are pinned by their own references.

Add a tool to this list only when it is genuinely missing from the Ubuntu archive. Check the package index first.

## Things that go wrong

- **The runner image has its own Node, Python and Rust earlier on `PATH`.** The script appends `/usr/bin` to `GITHUB_PATH` so the packages it installs win. Keep that, and check the version in a step if you depend on it.
- **`apt-get` needs `sudo` on the runner and not in a container.** The script uses `sudo` only when it is not root.
- **Actions pinned by commit SHA fail at startup** where the organization requires `actions.lock`. Reference actions by tag and let the lockfile pin them. Renovate is configured not to pin digests for that reason (`config:best-practices` would otherwise replace tags with SHAs). This is unrelated to the toolchains but caught the same migration.

## When the runner moves to the next LTS

Nothing needs changing in the repository, by design. If CI then fails, the cause is one of:

1. A new major version of Node, Python or Rust that the code does not support yet. Fix the code, or install the older toolchain from the archive only if the new release still ships it under a versioned name, and record the reason on this page.
2. A package that was renamed or dropped in the new release. Check the new package index and change the package name.
3. A tool from the list above that no longer works with the new toolchains. Update its pin.

Do not respond by pinning the runner label back. If it is unavoidable, say so in the pull request and set a date to remove it.
