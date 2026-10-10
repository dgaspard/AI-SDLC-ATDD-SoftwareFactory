#!/usr/bin/env bash
# Runs the browser suite inside the pinned Playwright reference container, locally and in
# CI, so screenshots match the frozen baselines on every host (A-17; visual-baselines
# README). The whole suite runs inside: the harness starts the services and frontend in
# the container, isolated from anything on the host's ports.
#
# Linux node_modules live in named Docker volumes, reinstalled only when a lockfile
# changes, so nothing built for the host OS is mounted into the container.
#
# Usage (from spec/): tests/browser/run-in-container.sh [playwright test args]
# Re-render baselines for human review: tests/browser/run-in-container.sh --update-snapshots
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.55.1-noble@sha256:2f29369043d81d6d69a815ceb80760f55e85f5020371ad06a4d996f18503ad1c"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VOLUME_PREFIX="petclinic-browser-$(printf '%s' "$ROOT" | shasum -a 256 | cut -c1-12)"

if ! docker info >/dev/null 2>&1; then
  echo "tooling: Docker is not running; the browser suite runs in ${IMAGE%@*}" >&2
  exit 1
fi

tty_flag=""
[ -t 1 ] && tty_flag="-t"

# New named volumes are owned by root; hand them to the user who runs the suite.
docker run --rm \
  -v "$VOLUME_PREFIX-spec:/v/spec" -v "$VOLUME_PREFIX-platform:/v/platform" \
  "$IMAGE" chown "$(id -u):$(id -g)" /v/spec /v/platform

# shellcheck disable=SC2086 # tty_flag is empty or a single flag
exec docker run --rm --init --ipc=host $tty_flag \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e CI -e npm_config_cache=/tmp/.npm \
  -v "$ROOT:/work" \
  -v "$VOLUME_PREFIX-spec:/work/spec/node_modules" \
  -v "$VOLUME_PREFIX-platform:/work/services/platform/node_modules" \
  -w /work/spec \
  "$IMAGE" bash -c '
    set -euo pipefail
    install() { # dir: npm ci when the lockfile differs from the one last installed
      local stamp="$1/node_modules/.lock-sha"
      local want; want="$(sha256sum "$1/package-lock.json" | cut -d" " -f1)"
      if [ "$(cat "$stamp" 2>/dev/null)" != "$want" ]; then
        find "$1/node_modules" -mindepth 1 -delete
        (cd "$1" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error)
        echo "$want" > "$stamp"
      fi
    }
    install /work/spec
    install /work/services/platform
    exec npx playwright test --config tests/browser/playwright.config.js "$@"
  ' run-in-container "$@"
