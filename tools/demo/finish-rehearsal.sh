#!/usr/bin/env bash
# After the rebuild: rerun the visible journey and the full aggregate, and report
# elapsed time since deletion. Appends one line to .demo/run.log.
#
#   tools/demo/finish-rehearsal.sh                 # rehearsals: journey + npm test
#   tools/demo/finish-rehearsal.sh --journey-only  # visible journey only
#                                                  # (the agent already ran npm test)
set -uo pipefail

mode=full
case "${1:-}" in
  "") ;;
  --journey-only) mode=journey-only ;;
  *)
    echo "Usage: $0 [--journey-only]" >&2
    exit 2
    ;;
esac

cd "$(dirname "$0")/../.."
if [ ! -f .demo/deleted-at ]; then
  echo "No deletion recorded (.demo/deleted-at). Run delete-checkout.sh first." >&2
  latest=$(ls -td "${DEMO_RUNS_DIR:-$HOME/petclinic-demo-runs}"/*/ 2>/dev/null | head -1)
  [ -n "$latest" ] && echo "Newest workspace: cd \"${latest%/}\"" >&2
  exit 1
fi

rebuilt=$(date +%s)
deleted=$(cat .demo/deleted-at)

npm run demo:journey
journey=$?
if [ "$mode" = full ]; then
  npm test
  aggregate=$?
else
  aggregate=skipped
fi
done_at=$(date +%s)

fmt() { printf '%dm%02ds' $(($1 / 60)) $(($1 % 60)); }
if [ $journey -eq 0 ] && { [ "$aggregate" = skipped ] || [ "$aggregate" -eq 0 ]; }; then
  result=PASS
else
  result=FAIL
fi
line="$(date '+%F %T') source=$(cat .demo/source-tag) direction=$(cat .demo/direction 2>/dev/null || echo unknown) mode=$mode rebuild=$(fmt $((rebuilt - deleted))) total=$(fmt $((done_at - deleted))) journey=$journey aggregate=$aggregate result=$result"
echo "$line" >> .demo/run.log

echo
echo "Rebuild (deletion → agent done): $(fmt $((rebuilt - deleted)))"
echo "Total including verification:    $(fmt $((done_at - deleted)))"
[ "$mode" = journey-only ] && echo "Full aggregate: not rerun here (see the agent's npm test summary)"
echo "Result: $result"
[ "$result" = PASS ]
