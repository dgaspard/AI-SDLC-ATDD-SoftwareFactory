# EVID-01 local slice: the change-evidence report

Status: **local slice built 2026-10-13.** EVID-01 overall stays open (release record per
prod promotion, SBOM and attestation binding, immutable retention). Backlog:
[EVID-01](../../BACKLOG.md#evid-01--evidence-bundle).

## Outcome

One command produces a readable Markdown report and versioned JSON describing what was
checked on an exact source tree, and what remains unknown:

```bash
npm run evidence:change            # writes test-results/evidence/<id>/change-evidence.{md,json}
npm run evidence:verify -- <file>  # exit 0 only for a complete report of the current tree
```

## Design

- **No second source of truth.** The report never reruns tests and never re-derives tree
  identity or gate status. It reads the runner's verifier (`node spec/run-all.js --verify
  --json`, frozen with this slice), the feature files on the tree (controls and accepted
  risks), and the hash of `spec/protected.sha256`. It reads no logs, so log contents can't
  leak into the report.
- **Contract:** `spec/delivery/contracts/change-evidence.v1.schema.json` (protected). Field
  names follow the release record (`sourceTree`, `gate`) where they mean the same thing.
- **Gate:** COMPLETE (every required suite passed on this tree), FAILED (a required suite's
  latest result on this tree failed) or INCOMPLETE (missing or stale results).
- **Controls** come from the delivery features' tags, with feature tags inherited as
  cucumber's profiles see them (a feature-level `@awaiting` or `@tier:live` covers every
  scenario in it). A control is `passed` or
  `suite-failed` according to the delivery suite on this tree (the report doesn't guess
  which scenario failed), `not-run` for the live tier or when the suite has no result, and
  `awaiting` for an `@awaiting` control, which never counts as passed or failed.
- **Honesty about what's unknown:** human review is "not recorded" and remote enforcement
  "not verified" unless real provenance exists; limitations always say no deployment was
  performed, and that cloud readiness is unproven while live or awaiting controls remain.
- **Safe output:** reports go under the gitignored `test-results/evidence/`, so they never
  change the tree they describe. Each report gets its own directory (generation time plus
  tree prefix, suffixed on collision), written to a temporary directory and renamed, so a
  failure never leaves a partial report or overwrites an earlier one. Untrusted text is
  escaped in Markdown; file reads are bounded to the feature directories and the manifest.
- **Strict check:** `--verify` rebuilds the report from the current verifier and features
  and rejects any difference except the generation time and execution context, so an
  edited gate, suite result, control, approver or enforcement claim fails. A report is
  also rejected once a later run on the same tree changes the proving runs; regenerate it.
  It checks the JSON only; the Markdown is a rendering and carries no authority.
- **Generator:** `tools/evidence/change-evidence.mjs`, Node built-ins only.

## Acceptance criteria

All eight are covered by `spec/tests/evidence/change-evidence.test.js` (14 tests, the
`evidence` suite in the full tier), plus one runner test for `--verify --json`:

| # | Criterion | Test |
|---|---|---|
| 1 | A complete current tree gives schema-valid JSON and matching Markdown | complete current tree |
| 2 | Mixed-tree, stale, malformed or missing inputs can't produce COMPLETE | stale or mixed-tree; malformed records; absent results |
| 3 | A failure is FAILED, an absence INCOMPLETE; neither is "awaiting" | explicit failure; absent results; awaiting controls; delivery suite failure |
| 4 | Accepted-risk semantics kept; STATE CHANGE prominent | accepted risks and STATE CHANGE |
| 5 | Generation doesn't change the tree; fixed inputs give stable content | tree unchanged, identical content |
| 6 | Escaped text, bounded reads, no secrets or raw logs | escaping and log contents |
| 7 | Human review and remote enforcement states are explicit | not verified |
| 8 | A failing CLI still leaves useful output where safe; never overwrites | broken input; strict check |

## Examples (FIXTURE data, not this repository's results)

Generated from a throwaway fixture repository with two suites and three controls:

- **COMPLETE:** both suites passed; CTL-029 passed; CTL-024 (live) not run; CTL-020
  awaiting CI-02; "Cloud readiness is unproven"; human review not recorded.
- **FAILED:** the features suite failed 234/286; the gate reads FAILED, the failed suite is
  listed first under "Unresolved risks", and the same unknowns are stated.

The tests regenerate both shapes (with their own fixture controls) on every run. The current tree's own report is produced
with `npm run evidence:change` after the gate; it is local output and isn't committed.

## Later scope

Release publication and a release record per prod promotion, SBOM and attestation binding,
the control coverage matrix with NIST and SSDF tags, and immutable retention (S3 Object
Lock) stay in EVID-01. Running the report in CI and attaching it to the pull request is a
small follow-up once the gate job's evidence step is decided.
