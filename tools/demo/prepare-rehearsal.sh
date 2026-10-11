#!/usr/bin/env bash
# Create a disposable demo workspace from a tagged checkpoint (A-12, DEMO-01).
# Not timed. Run on the operator's machine before a reconstruction run.
#
#   tools/demo/prepare-rehearsal.sh [run-name] [tag]
#
# The copy has its own fresh git repository. The JavaScript Checkout is present so
# the "before" journey can run, but it is never committed there, so after deletion
# it is not recoverable from that workspace's history.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
name="${1:-rehearsal-$(date +%Y%m%d-%H%M%S)}"
tag="${2:-demo-01-baseline}"
runs="${DEMO_RUNS_DIR:-$HOME/petclinic-demo-runs}"
dest="$runs/$name"

for cmd in claude python3.12 node; do
  command -v "$cmd" >/dev/null || {
    echo "Missing '$cmd' on PATH. Install it before preparing a demo workspace." >&2
    exit 1
  }
done
if [ -e "$dest" ]; then
  echo "Refusing to overwrite existing $dest" >&2
  exit 1
fi
git -C "$repo" rev-parse -q --verify "refs/tags/$tag" >/dev/null || {
  echo "Tag $tag not found in $repo" >&2
  exit 1
}

mkdir -p "$dest"
git -C "$repo" archive "$tag" | tar -x -C "$dest"
cd "$dest"

# Fresh history that never contains the JavaScript Checkout.
git init -q
printf 'services/checkout/\n.demo/\n' >> .git/info/exclude
git add -A
git -c user.name=demo -c user.email=demo@localhost commit -q \
  -m "Demo workspace from $tag (Checkout excluded from history)"

# Preinstall everything so the timed run never waits on the network for these.
npm --prefix spec ci --no-audit --no-fund
for s in services/*/setup frontend/setup; do
  [ -x "$s" ] && "$s"
done

mkdir -p .demo
echo "$tag" > .demo/source-tag
echo
echo "Ready: $dest"
echo "Next:  cd \"$dest\" && npm run demo:journey    # JavaScript 'before' run"
echo "Then:  tools/demo/delete-checkout.sh"
