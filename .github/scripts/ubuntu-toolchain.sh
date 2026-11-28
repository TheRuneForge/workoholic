#!/bin/sh
# Installs toolchain packages from the Ubuntu APT repositories and puts them
# first on PATH.
#
#   sh .github/scripts/ubuntu-toolchain.sh nodejs npm python3
#
# The runner is ubuntu-latest, which follows the Ubuntu LTS. Within a release the
# package list is frozen: Ubuntu publishes only maintenance and security updates
# for it. Updating the package index and installing the unversioned packages
# (nodejs, python3, rustc, cargo) gives the series the release ships with all of
# those fixes, which is what `apt update && apt upgrade` would give. When GitHub
# moves the label, the next release's series arrives on its own. Do not use
# packages whose names carry a version (python3.14, rustc-1.93) or pin a version.
#
# The runner image also has third-party APT sources (for example NodeSource).
# Only the Ubuntu archive is trusted here, so every package is checked after the
# install and the script fails if it came from anywhere else.
set -eu
set -f

. /etc/os-release
if [ "${ID:-}" != ubuntu ]; then
  echo "This needs an Ubuntu runner, but the system is ${PRETTY_NAME:-unknown}." >&2
  exit 1
fi
if [ "$#" -eq 0 ]; then
  echo "usage: ubuntu-toolchain.sh <package> ..." >&2
  exit 2
fi

sudo=
[ "$(id -u)" -eq 0 ] || sudo=sudo
$sudo apt-get update
$sudo apt-get install --yes --no-install-recommends "$@"

for package in "$@"; do
  installed=$(dpkg-query --showformat='${Version}' --show "$package")
  # apt-cache policy lists the sources of the installed version below its line.
  if ! apt-cache policy "$package" | awk -v v="$installed" '
      $1 == "***" && $2 == v { listing = 1; next }
      listing && /^ {8}[0-9]+ / { if ($0 ~ /ubuntu/) found = 1; next }
      listing { listing = 0 }
      END { exit !found }'; then
    echo "$package $installed was not installed from the Ubuntu archive." >&2
    exit 1
  fi
done

# The runner image ships its own toolchains earlier on PATH; the packages
# installed here must win.
if [ -n "${GITHUB_PATH:-}" ]; then
  echo /usr/bin >>"$GITHUB_PATH"
fi
