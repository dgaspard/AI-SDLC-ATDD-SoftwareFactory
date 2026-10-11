# ENG-02 independent reviewer prompt

Hand this file's contents to a **fresh agent session with no memory of
building this code** — the Agent tool's `isolation: "worktree"` mode (a
genuinely separate instance working on an isolated copy of the repo), per
`docs/design/eng-02-review.md`'s confirmed mechanism. Never run this review in
the same session that just wrote or fixed the code under review — that
defeats the entire point of ENG-02 superseding ENG-01's self-review, which
was never independently tested and missed what a calibrated review later
caught.

This is a **living checklist**, not a fixed, closed scope. It starts from
ENG-01's original criteria plus everything ENG-02 added. When a new defect
class or check proves itself useful — through calibration, through a real
bug it would have caught, through a pattern that recurs — add it here. The
goal, stated plainly in `docs/design/eng-02-review.md`: get better at this over
time, and eventually hand the list to someone else so they aren't starting
from zero.

## Your mandate

You have never seen this codebase before. Form your own judgment from the
code, the specs, and the automated-gate output — don't assume anything
upstream of this review was done correctly, including this prompt's own
framing. Every finding you report must cite a real file and line number.
A finding without a citation is not a finding; it's a suspicion, and
should be marked as one explicitly if you want to raise it anyway.

## Before you start: read these

- `docs/design/eng-02-review.md` — why this review exists and how it's governed.
- `tools/review/project-specific/threat-model.md` — already-disclosed,
  already-accepted risks (currently: the shared HS256 secret, THREAT-01;
  the dual-role account's blast radius, THREAT-02). Don't re-report these
  as new findings — check whether your own findings are actually new
  instances of an already-disclosed risk, or genuinely new.
- `spec/contracts/auth-contract.md` — the intended authentication/authorization
  design, so you can tell "the code matches a documented risk" apart from
  "the code does something nobody signed off on."
- `docs/observability.md`'s traceability table and
  `docs/engineering-reviews/eng-02-observability-audit.md` — the
  observability rule audit already done; don't redo it, but do flag if you
  find something it missed.
- `docs/history/backlog-completed.md`'s ENG-01 section — the original
  review criteria this supersedes. Everything ENG-01 asked for is still in
  scope below; ENG-02 adds independence, calibration, and automated gates
  on top, it doesn't replace ENG-01's substance.

## Run the automated gates first; don't re-derive them by hand

These already exist and are faster and more reliable than manual
inspection for what they cover. Run them, read the output, and spend your
own judgment on what they *can't* check:

```
npm run test:engineering     # import-boundary check + other project-specific engineering tests
npm --prefix spec run guard:check   # protected-file integrity
npm run trace:payment        # one real cross-process payment trace
npm --prefix services/platform audit   # dependency vulnerabilities
```

`tools/security/portable/run-sast.sh` and `tools/review/portable/run-dupe-check.sh`
need real network access to install their tools (Semgrep, jscpd) — if
you're in a network-restricted environment, note that you couldn't run
them rather than silently skipping; the human running this review may need
to run those two locally and hand you (or a later reviewer) the output.

## Checklist

For each item, answer **followed / not followed / N/A**, cite file:line,
and say what it would take to exploit or break it if "not followed."

### 1. Service boundaries

- Does every service own its own state? Does anything read another
  service's data store directly, bypassing that service's own API?
- Is business logic duplicated across services instead of one service
  being the single source of truth and the others calling it?
- Is `services/platform/` the only shared code path, with no other
  cross-service import? (The import-boundary automated gate covers the
  mechanical version of this — your job is the judgment calls it can't
  make: is something *routed* correctly even if it's not a direct import,
  like one service quietly recomputing another's business rule instead of
  calling it.)

### 2. Payment safety

- Trace at least one real payment end-to-end: idempotency-key check,
  provider call, recorded result, and every downstream account/reservation
  update it triggers. Cite the actual code path, not just the trace output.
- Does any code mutate its own local state to reflect a payment, credit, or
  discount as applied *before* the downstream call that actually confirms
  it succeeds? If that downstream call then fails, does the local mutation
  get rolled back, or does the service's own record now permanently
  disagree with the system it just called? (Added 2026-10-05, from a real
  finding: this is a distinct defect shape from "does a retry double-charge" —
  it's "does a single, non-retried failure leave one service's record
  permanently wrong relative to the service it just called.")
- Does a retry (sequential or concurrent) ever cause a duplicate charge,
  a duplicate credit, or a double-counted booking fee?
- Are amounts handled as integer cents throughout, with no floating-point
  arithmetic on money anywhere in the path?
- If a provider call succeeds but a downstream step then fails, is that
  reported accurately (not silently as success), and does a subsequent
  retry avoid charging again?
- After any partial failure (money taken but credit not recorded, discount
  recorded but reservation not completed, charge posted but bill not
  stored), can a retry *finish the job*, or does the operation get stuck
  permanently because the retry replays the old error or hits an
  "already applied" guard? Reporting the failure honestly isn't enough on
  its own. (Added 2026-10-05, from calibration round 1's unplanted findings.)
- Is every guard that a comment claims protects against double-charging
  actually *read* on the path it protects? (Added 2026-10-05, from
  calibration.)

### 3. Inter-service authentication (hand-written, not a library)

This codebase hand-rolls JWT signing and verification
(`services/platform/runtime.js`'s `sign()`/`token()`/`authenticate()`)
rather than using a vetted library. Treat this code with the suspicion a
hand-rolled crypto/auth implementation deserves:

- Is the signature actually verified before any claim is trusted, on every
  authenticated route, with no path that skips verification?
- Is the signature comparison constant-time (`timingSafeEqual` or
  equivalent), not a plain `===` or string comparison that could leak
  timing information?
- Is the algorithm pinned (no "alg: none" or algorithm-confusion path)?
- Are expiry (`exp`), subject, and role claims validated, not just
  presence-checked?
- Does the dual-role claim (`roles`) get validated the same way the
  primary `role` claim does, or is there an inconsistency an attacker
  could exploit (e.g., forging an extra role that never gets checked
  against the same allowlist)?
- Does every admin-only, veterinarian-only, or customer-only route
  actually check the caller's role, with no route reachable by an
  unauthorized role through a missing or misordered check?
- Is any authentication or authorization decision based on *where* the
  request came from (peer address, loopback, Host or Origin header) rather
  than on a verified token? Network location is not identity. (Added
  2026-10-05, from calibration.)
- Does the CORS policy match RT-006 exactly: an allowlisted origin, never a
  reflected arbitrary `Origin`, and never credentials combined with a
  broad origin? Check this together with the item above, because a
  location-based trust bypass becomes reachable from any web page through a
  permissive CORS policy. (Added 2026-10-05, from calibration.)
- Is any request-supplied value (a decoded path parameter, a query string)
  interpolated into a downstream URL that is sent with a **service** token,
  or into a `RegExp`, shell command, or query string? Decoded path params
  can contain `/` and `..`, which lets a caller re-target the downstream
  call with service privileges. (Added 2026-10-05, from a real pre-existing
  shape found while planting calibration defects.)

### 4. Privacy in telemetry and errors

- Do any OpenTelemetry span attributes, anywhere, carry clinical notes,
  diagnoses, medications, raw payment method details, or other sensitive
  fixture data? (`docs/engineering-reviews/eng-02-observability-audit.md`
  already checked this for OBS-021 as of 2026-10-05 — re-verify it still
  holds rather than trusting it blindly, since new code may have shipped
  since.)
- Do error responses (4xx/5xx bodies) leak internal details — stack
  traces, other users' data, database/internal identifiers that shouldn't
  be client-visible?
- Treat logs (stdout/stderr) as a telemetry channel too: no tokens,
  `Authorization` headers, secrets, or payment method details in any
  `console.*` call, including on error paths.
- Is a 404 used consistently to hide the existence of another user's
  resource (not a 403, which would confirm the resource exists)?

### 5. Structure

- Hardcoded scenario-specific values that should be configuration or
  computed.
- Duplicate payment or business-logic paths doing the same thing two
  different ways.
- Control flow that obscures what outcome a request actually produced
  (deeply nested conditionals, outcomes computed far from where they're
  returned, etc).
- Anything unnecessarily coupling two services beyond their declared API.
- For every field an admin (or any caller) can set that is supposed to
  constrain future behavior — an `active`/`enabled`/`deactivated` flag, a
  role, a status — grep for every place that field is *read*, not just
  where it is written. A flag that's written, exposed in an API response,
  and demoed in a UI, but never actually checked by the code paths it's
  supposed to constrain, is a real and easy-to-miss defect shape. (Added
  2026-10-05, from a real finding: a veterinarian's `active` flag could be
  set to `false` but every booking-path route still ignored it.)

### 6. Documentation (the docs pass)

Run the checklist in `docs/README.md` ("The docs pass, after every feature commit")
against the change under review. Report doc findings separately from code findings:
stale status, decisions recorded outside their log, files outside the allowed homes,
duplicated facts, and broken links (cite the file and line, as for code). Propose the
fix as a diff; a broken link in a protected file goes to the human as a patch.

## Calibration defects this checklist should already be able to catch

Living list — currently six (`docs/design/eng-02-review.md`): copied business
logic across services, a payment reference leaked into a span, a token
check that skips signature verification, cross-service store access, a
missing OBS attribute on an untested rule, and an admin-only route missing
its role check. Calibration plants more than these six; the full set is
kept outside the copy you review. If a calibration run (planting these on
a scratch copy) finds one this checklist didn't catch, the fix is to
improve this checklist, not just note the miss once and move on.

## Reporting your findings

For every finding:

1. **ID** (sequential, e.g. `REV-001`).
2. **Category** — which checklist section it falls under.
3. **File:line.**
4. **What you found**, in your own words, not a restatement of the
   checklist item.
5. **Severity** — critical / high / medium / low / note.
6. **Needs human sign-off?** — yes for anything touching security or
   service boundaries (per ENG-02's governance model), no otherwise.
7. **Suggested fix**, if you have one. If you don't, say so rather than
   inventing a plausible-sounding one.

Write your findings to a new file under `docs/engineering-reviews/`,
named for the build and date you reviewed (e.g.
`eng-02-review-impl-02-<date>.md`). Do not edit the code under review as
part of this task — a review that silently fixes what it finds isn't a
review anyone can trust. If a finding is uncontroversially correct to fix
immediately (a typo, a clearly dead code path), still report it rather
than fixing it; let the human decide what gets fixed and when.
