# ENG-02: independent, calibrated engineering review

Not protected by GUARD-01, not part of `npm test` (except `portable/`, which
is *meant* to require review via `.github/CODEOWNERS` — see the note at the
bottom of this file on its current status).

```
tools/review/
  portable/            # generic review engines — see portable/README.md
  project-specific/    # this app's own checks, fixtures, and findings
```

Supports the ENG-02 backlog item: an independent, calibrated engineering
review that supersedes ENG-01's self-review. Full planning and decisions:
[`docs/design/eng-02-review.md`](../../docs/design/eng-02-review.md). Five components,
per `BACKLOG.md`:

1. Automated gates — duplicate-code detection, the import-boundary check,
   security scanning and dependency audit (reusing `tools/security/portable/`
   directly rather than re-implementing), connected-trace capture.
2. Observability rule audit.
3. An independent reviewer process — fresh session, checklist-driven, cites
   file/line, human signs off security/boundary findings.
4. A threat-model note.
5. Calibration — planted defects, measured catch rate, same discipline
   SEC-01 already proved out for the security tier alone.

## The portable/project-specific split

Same engine/parameters test as `tools/security/` (A-15), which itself
borrowed this split from the import-boundary check this folder now owns:
if running the same mechanism against a different project would need only
new *parameters*, it's portable; if it needs rewritten *logic*, it's
project-specific, however abstractly it's written.

## What moved here, and what didn't

`tools/ownership.test.mjs`, `tools/engineering-review.test.mjs`, and
`tools/frontend-engineering.test.mjs` (the pre-existing "additional
engineering evidence" checks, run via `npm run test:engineering`) moved into
`project-specific/` — they're all specific to this app's fixtures, routes,
and business rules, not generic engines.

**Note on `ownership.test.mjs`:** despite the name, its actual content
(verifying that a different customer's resource ID can't be substituted to
bypass the 404 ownership check) is a resource-ownership access-control test,
not the service-level *import*-boundary check BACKLOG describes ("no service
imports another service's code or a store"). That check now lives separately
at `portable/check-import-boundaries.mjs` + `project-specific/import-boundaries.json`
(wired in via `project-specific/import-boundaries.test.mjs`). Kept
`ownership.test.mjs` under its original name since renaming it is a
separate, deliberate decision, not a side effect of this move.

## CODEOWNERS protection: wired up

`.github/CODEOWNERS` now has mandatory-review entries for both
`tools/security/portable/` and `tools/review/portable/` (added 2026-10-04,
alongside `tools/review/project-specific/threat-model.md` — see
`docs/design/eng-02-review.md`'s "Resolved (2026-10-04, second pass)" section).

## Automated gates: status

- **Import-boundary check** — built, passing, wired into
  `npm run test:engineering`. See `portable/check-import-boundaries.mjs`.
- **Duplicate-code detection** — `portable/run-dupe-check.sh` wraps `jscpd`.
  Needs real npm-registry access to install it, so (like
  `tools/security/run-sec01-spike.sh`) it can't run inside this agent
  sandbox's restricted network. Run it locally:
  `bash tools/review/portable/run-dupe-check.sh <path> <output-dir>`.
- **Security/dependency scans** — reuse `tools/security/portable/` directly,
  not re-implemented here.
- **Connected-trace capture** — already existed as `npm run trace:payment`
  (`tools/capture-payment-trace.mjs`); now exercised against every build.
  PASS on `main` and the `r2` JS rebuild in-sandbox. The `r1`/`r3` Python
  rebuilds can't run here (host-built `.venv` pointing at a macOS Python
  framework path this sandbox doesn't have — same category of limitation as
  Playwright/Chromium). See
  `docs/engineering-reviews/eng-02-connected-trace.md` for the full record
  and the two commands to run locally to close that out.
