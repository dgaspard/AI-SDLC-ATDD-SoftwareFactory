# DORA metrics: counting rules (calculation version `dora-1`)

DORA-01 local slice. These are this project's operational conventions for the five DORA
metrics (reference: https://dora.dev/guides/dora-metrics/, five-metric model reviewed
2026-10-13). They are not universal DORA requirements. Changing any rule here is a human
freeze and a new calculation version.

Contracts: `contracts/dora-events.v1.schema.json` (input) and
`contracts/dora-metrics.v1.schema.json` (output). Tests: `spec/tests/dora/`.

## Scope and window

- Each report covers one service in one environment over a UTC half-open window
  `[from, to)`. Events from other services or environments never count.
- Events outside the window may be supplied as supporting records (earlier deliveries,
  incidents caused by earlier deployments). They are validated but don't count unless a
  rule below says so.
- A dataset is either `synthetic` or `real`, never both. Every event carries the dataset's
  classification; a mismatch rejects the whole input. Synthetic reports are labelled
  **SYNTHETIC — MEASUREMENT DEMONSTRATION**.
- A real dataset with no qualifying deployment is **NOT YET MEASURED**: every metric is
  unavailable, never zero.

## Deployments

- A deployment is **applied** when it changed the running service: status `succeeded` or
  `failed-after-activation`. Status `failed-before-activation` never counts.
- A **qualifying deployment** is applied, matches the service and environment, and has
  `activatedAt` in the window. A rollback that changes the running version is its own
  qualifying deployment.
- A deployment's `kind` is `planned`, `unplanned` or `unclassified`. Unclassified
  deployments stay in every denominator and are reported, never silently excluded.

## The five metrics

| Metric | Calculation |
|---|---|
| Deployment frequency | Qualifying deployments ÷ window length in days. Reports the count and the days. CI runs, merges, previews and `failed-before-activation` attempts never count. |
| Change lead time | For each commit whose **first successful delivery** (earliest `succeeded` deployment of this service and environment containing it, at any time) falls in the window: that deployment's `activatedAt` minus the commit's `committedAt`. Median in hours, with the sample size. A commit counts once, however often it is redeployed. Complete only when the dataset asserts complete change history; otherwise the sample is labelled incomplete. |
| Change fail rate | Distinct qualifying deployments that caused at least one incident with `immediateIntervention: true`, ÷ qualifying deployments. Several incidents on one deployment count it once. |
| Failed deployment recovery time | For incidents caused by a deployment of this service and environment, with `immediateIntervention: true` and `failedAt` in the window: median of `restoredAt − failedAt` in minutes over the recovered ones. Open incidents are listed separately and never count as zero or as recovered. Recovery may end after the window. |
| Deployment rework rate | Qualifying deployments with `kind: unplanned` and a `triggeredByIncident` link ÷ qualifying deployments. |

## Unavailable and provisional results

- A metric that can't be calculated is `null` with a reason, plus its counts. Examples: no
  qualifying deployments; no recovered failures (recovery time); no commits first delivered
  in the window (lead time).
- A rate of zero is reported only when the deployment set is nonempty **and** the
  classifications it depends on are complete. Otherwise it is `null` with a reason:
  - change fail rate needs incident completeness `complete` and no incident on a qualifying
    deployment with `immediateIntervention: null`;
  - rework rate needs no `unclassified` qualifying deployment.
- A result is **provisional** when the dataset's observation ended before the window did
  (`observedTo` earlier than `to`), when a completeness it depends on is not `complete`, or
  when an incident it counts is still open.
- Completeness is what the dataset asserts, with its source. The calculator reports it; it
  doesn't prove it.

## Validation (the input is rejected, and nothing is written)

- Timestamps that aren't ISO 8601 UTC; a window with `to` not after `from`.
- Negative durations: `restoredAt` before `failedAt`, or a commit's `committedAt` after
  the `activatedAt` of a successful delivery containing it.
- An incident whose `causedByDeployment` doesn't exist or belongs to another service or
  environment; a `triggeredByIncident` or `recoveryDeployment` that doesn't exist.
- Two records with the same ID and different content. Identical duplicates count once.
- Classification values outside the contract, or events whose dataset classification
  doesn't match.

## What the report never contains

No developer, author or individual ranking; no aggregate score or confidence value; no
claim that these metrics show client value, AI causality or compliance. Every report cites
the calculation version and the input's sha256, and the same inputs reproduce the same
report.
