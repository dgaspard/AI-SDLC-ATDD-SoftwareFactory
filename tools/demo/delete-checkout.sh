#!/usr/bin/env bash
# Experiment step: ask the operator, then delete the current Checkout (timed).
# Run inside a demo workspace (prepare-rehearsal.sh or fork-workspace.sh), never
# in the main repo.
#
#   tools/demo/delete-checkout.sh [python|javascript]   # language to rebuild in (default python)
set -euo pipefail

target="${1:-python}"
case "$target" in
  python) prompt=tools/demo/rebuild-checkout-prompt.md ;;
  javascript | js)
    target=javascript
    prompt=tools/demo/rebuild-checkout-prompt-js.md
    ;;
  *)
    echo "Usage: $0 [python|javascript]" >&2
    exit 2
    ;;
esac

cd "$(dirname "$0")/../.."
if [ ! -f .demo/source-tag ]; then
  echo "This is not a disposable demo workspace (no .demo/source-tag). Aborting." >&2
  latest=$(ls -td "${DEMO_RUNS_DIR:-$HOME/petclinic-demo-runs}"/*/ 2>/dev/null | head -1)
  [ -n "$latest" ] && echo "Newest workspace: cd \"${latest%/}\"" >&2
  exit 1
fi
if [ ! -d services/checkout ]; then
  echo "services/checkout is already gone." >&2
  exit 1
fi
if [ ! -f "$prompt" ]; then
  echo "Missing $prompt in this workspace." >&2
  exit 1
fi

if [ -f services/checkout/requirements.txt ]; then
  current=Python
elif [ -f services/checkout/package.json ]; then
  current=JavaScript
else
  current=unknown-language
fi

echo "About to delete services/checkout/ (the $current Checkout service)."
echo "It will be rebuilt in $target. Contracts, features, tests, and the other services stay."
read -r -p "Delete it now? [y/N] " answer
case "$answer" in
  y | Y | yes | YES) ;;
  *)
    echo "Nothing deleted."
    exit 0
    ;;
esac

start=$(date +%s)
rm -rf services/checkout
# From now on the rebuilt service is tracked normally.
sed -i '' '/^services\/checkout\/$/d' .git/info/exclude 2>/dev/null ||
  sed -i '/^services\/checkout\/$/d' .git/info/exclude
end=$(date +%s)

echo "$end" > .demo/deleted-at
echo "$current->$target" > .demo/direction
echo "Deleted in $((end - start)) s at $(date '+%H:%M:%S')."
echo
echo "Start the rebuild in a fresh Claude Code session:"
echo "  claude \"\$(cat $prompt)\""
echo "When it reports done:  tools/demo/finish-rehearsal.sh"
