# DORA-01 local slice: delivery metrics foundation

Status: **local slice built 2026-10-13.** Real results are NOT YET MEASURED: this repository
has no prod deployments (ENV-03) or recorded incidents yet. Backlog:
[DORA-01](../../BACKLOG.md#dora-01--delivery-metrics).

## Outcome

A small offline calculator demonstrates all five DORA metrics with transparent counting
rules, denominators and sample sizes:

```bash
npm run metrics:dora -- --input spec/tests/dora/fixtures/golden.json \
  --from 2026-01-01T00:00:00Z --to 2026-01-11T00:00:00Z \
  --service checkout --environment production --now 2026-01-20T00:00:00Z
```

It writes `test-results/dora/<id>/dora-metrics.{md,json}` (gitignored). On the golden
fixture (**SYNTHETIC — MEASUREMENT DEMONSTRATION**): 0.5 deployments/day (5 in 10 days),
3-hour median lead time (5 commits), 40% change fail rate (2 of 5), 60-minute median
recovery (2 recovered), 40% rework rate (2 of 5), all final.

## Design

- **Counting rules are a frozen spec:** [`spec/delivery/dora.md`](../../spec/delivery/dora.md),
  calculation version `dora-1`. They are this project's conventions, reviewed against the
  DORA guide on 2026-10-13, not universal DORA requirements. Changing one is a freeze and a
  new calculation version.
- **Contracts:** `spec/delivery/contracts/dora-events.v1.schema.json` (input: dataset
  metadata with asserted completeness, deployments, incidents) and
  `dora-metrics.v1.schema.json` (output).
- **Never a manufactured zero:** an empty real dataset is NOT YET MEASURED. A 0% rate needs a
  nonempty deployment set and complete classification. Otherwise the value is `null` with a
  reason. Open incidents are listed and never treated as recovered.
- **Adapter boundary:** loading events is the only input. Later GitHub, cloud and incident
  adapters produce the same `dora-events` shape; the calculator needs no network,
  credentials, database or server.
- **No individual data:** commit authors are accepted but never reported; there is no
  ranking, score or confidence value, and limitations state that the metrics don't show
  client value, AI causality or compliance.
- **Reproducible:** the clock and window are inputs; each report cites the calculation
  version and the input's sha256, and is written atomically to its own directory.
- **Calculator:** `tools/dora/dora-metrics.mjs`, Node built-ins only. It validates the input
  itself (timestamps, negative durations, links, duplicates, classifications, synthetic and
  real mixing) and writes nothing when the input is invalid.

## Acceptance criteria

All seven are covered by `spec/tests/dora/dora-metrics.test.js` (22 tests, the `dora` suite
in the full tier): the golden results with denominators; NOT YET MEASURED and the 0% case;
open incidents and incomplete classification; nonproduction events, synthetic and real
mixing, duplicates, window boundaries, redeployed commits, rollbacks, pre-activation
failures, failed applied deployments and cross-window recovery; incomplete change history
and unclassified deployments; provenance and reproducibility; and no individual data.

## Relationship to EVID-01

Independent. A deployment's optional `evidence` field can cite its change-evidence report or
release record, which later lets results be split by what was verified before shipping. The
calculator never requires one.

## Later scope

Real deployment and incident adapters (after ENV-03), versioned changes to the counting
rules, baselines and trends, and outcome, cost and learning measures beyond delivery
performance.
