# ENG-02 independent review — impl-02 (JavaScript baseline + MVP-02A)

Date: 2026-10-05. Reviewer: fresh agent session, no prior memory of this
codebase or its build history (per `docs/design/eng-02-review.md`'s governance
model and `tools/review/review-prompt.md`'s mandate). This is the first
independent run of ENG-02's checklist against the real MVP-02A code, not a
rerun of the self-review that produced `docs/engineering-reviews/impl-02-javascript.md`
or the structural audit in `docs/engineering-reviews/eng-02-observability-audit.md`.

## What this run did and did not do

- Read `docs/design/eng-02-review.md`, `tools/review/project-specific/threat-model.md`,
  `spec/contracts/auth-contract.md`, `docs/observability.md`,
  `docs/engineering-reviews/eng-02-observability-audit.md`, and
  `docs/history/backlog-completed.md`'s ENG-01 section before starting, as
  instructed.
- **Did not run** `npm run test:engineering`, `npm run guard:check`,
  `npm run trace:payment`, `npm --prefix services/platform audit`, or the
  SAST/dupe-check scripts — this environment has no shell access. These are
  recorded elsewhere (`docs/engineering-reviews/eng-02-connected-trace.md`
  and the existing audit docs); I did not re-verify their output myself and
  the human running this review should treat that gap as open, not as a
  pass, until someone re-runs them in an environment that can.
- Focused manual reading on `services/platform/runtime.js` (full file),
  `services/checkout/server.js` (full file), `services/reservation/server.js`
  (full file, including the MVP-02A admin/roster/reassignment routes), and
  skimmed `services/customer/server.js` and
  `services/veterinarian-services/server.js` for boundary/structure issues,
  per the brief. I also read the relevant slices of
  `spec/contracts/reservation.openapi.json` and `customer.openapi.json`
  (`x-roles` declarations) and `spec/features/reservation/manage-veterinarians.feature`
  to check whether code behavior matched documented intent (D-39–D-51).
- All five checklist sections below were completed. Nothing was left
  half-checked.

## Checklist walkthrough

### 1. Service boundaries

- **Followed**, mostly. Every service keeps its own in-memory store
  (`bills`/`attempts` in checkout, `reservations`/`visits`/`vets` in
  reservation, `customers`/`users` in customer, `services` in
  veterinarian-services); no service reaches into another's `Map`/`Set`
  directly. Cross-service calls go through `app.client()`/`app.dependency()`
  with a signed service token, not direct store access. `services/platform/`
  is the only shared import across services (consistent with the automated
  import-boundary gate's intent — I did not re-run that gate myself, see
  above).
- **Not followed** in two places found during this review — see REV-003 and
  REV-004 below. Both are genuine new findings, not restatements of
  THREAT-01/THREAT-02.
- No duplicated *business logic* (rule-computation) was found across
  services — the duplication found is duplicated *reference data*
  (veterinarian roster, service catalog), which is a narrower problem than
  the calibration list's "copied business logic" defect but close enough in
  spirit that I'm flagging it under this section.

### 2. Payment safety

Traced the visit-balance payment path end-to-end:
`POST /checkouts/{checkoutId}/payments` → `pay()` in
`services/checkout/server.js:310-382` → idempotency check via
`attempts`/`replay()` (`:317-320`) → `authorize()` (`:347-350`, calls the
fake payment provider through `app.client(..., { payment: true })`) →
`account(c, "credit", ...)` (`:355`, calls Customer's
`/internal/customers/{id}/account-changes`) → `complete(c)` (`:357`, calls
Reservation's `/internal/reservations/{id}/complete`). Booking-fee path
traced similarly through `/internal/booking-fees`
(`services/checkout/server.js:123-190`), called from
`services/reservation/server.js:208-221` (`accept` route).

- **Idempotency**: followed. Both booking-fee and visit-payment paths key
  attempts by `Idempotency-Key` scoped to the resource (`booking:{reservationId}:{key}`,
  `visit:{checkoutId}:{key}`), verify a `canonical()` fingerprint of the
  request body before replaying, and return `idempotency_conflict` (409) on
  a changed body under a reused key. Concurrent retries are additionally
  serialized by `Locks.run()` keyed to the same resource, so a race can't
  slip two authorizations past the `attempts.has()` check.
- **Integer cents**: followed throughout; no floating-point arithmetic on
  money found in `checkout/server.js`, `reservation/server.js`, or
  `customer/server.js`. The one division (`eligibility`'s denial message,
  `services/reservation/server.js:168`) is a display string, not used in
  any further calculation.
- **Provider-success-then-downstream-failure reporting**: followed at the
  response/telemetry layer — `pay()`'s catch block (`:368-380`) correctly
  reports `authorized_completion_failed` (502) with the payment attempt ID
  when `authorize()` succeeded but a later write throws, matching the
  contract (`docs/observability.md`'s OBS-031 notes, D-10). A replay of the
  same key afterward returns the remembered error rather than re-charging.
- **Not followed**: the in-memory bill object is mutated to reflect the
  payment/promotion as applied *before* the downstream `account()` call
  that is supposed to confirm it is actually confirmed. See REV-001 and
  REV-002. This doesn't cause a duplicate charge or duplicate credit (the
  idempotency-key path still protects against that), but it does leave
  Checkout's own view of the bill permanently wrong relative to Customer's
  actual ledger on exactly the failure path the contract says "needs manual
  recovery" — which makes that manual recovery harder, not easier, because
  the operator's own source of truth for the bill already lies.

### 3. Inter-service authentication

Reviewed `sign()`, `token()`, `serviceToken()`, and `authenticate()` in
`services/platform/runtime.js:184-264`, plus the generic role-check and
business-span gating in `serve()` (`:482-522`).

- Signature verified before any claim is trusted: **followed**. The route
  dispatcher (`:482-522`) calls `this.authenticate(...)` before any route
  handler runs for every non-anonymous route; there is no code path that
  reads `claims` without going through `authenticate()` first.
- Constant-time comparison: **followed**. `timingSafeEqual` (`:226`) is
  used for the HMAC digest; the preceding `s.length !== expected.length`
  short-circuit avoids calling `timingSafeEqual` on mismatched lengths
  (which would otherwise throw), and since a valid signature's encoded
  length is fixed, this length check leaks nothing useful to an attacker.
- Algorithm pinned: **followed**. `head.alg !== "HS256"` is rejected
  (`:224`); there is no `alg: "none"` path or algorithm-confusion branch.
- `exp`, `sub`, `role` validated (not just presence-checked): **followed**.
  `:230-238` checks `claims.exp` is finite and not expired, `claims.sub` is
  truthy, and `claims.role` is in the closed allowlist
  (`customer`/`veterinarian`/`service`/`administrator`). `:239-243`
  additionally requires `customerId`/`veterinarianId` to be present for
  the matching primary role.
- Dual-role (`roles`) claim validated the same way: **followed**.
  `:246-259` requires `roles` (when present) to be an array whose every
  element is in the exact same closed allowlist used for `role`. I did not
  find a role string accepted in `roles` that would be rejected if it were
  the primary `role` claim, so there's no allowlist-bypass-via-`roles`
  defect here (the calibration list's defect class this maps to).
- Admin/vet/customer/internal routes checking the caller's role, with no
  missing or misordered check: **followed**, verified by reading
  `x-roles` in the OpenAPI contracts, not just the code: `addVeterinarian`
  and `updateVeterinarian` are `x-roles: ["administrator"]`
  (`spec/contracts/reservation.openapi.json:53-55,102-104`);
  `reassignVeterinarian` is `x-roles: ["veterinarian"]` (no admin bypass,
  correctly matching D-48/49's "self-claim only" design, line ~663); every
  `/internal/...` route in `checkout.openapi.json`, `reservation.openapi.json`,
  and `customer.openapi.json` I checked is `x-roles: ["service"]` only. The
  generic check at `runtime.js:495-500` (role or `roles` must intersect the
  route's allowlist) is applied once, structurally, for every route — there
  is no per-route opt-out.
- No new instance of the "admin-only route missing its role check"
  calibration defect (#6 in `docs/design/eng-02-review.md`'s list) was found on
  the real MVP-02A routes. That's a meaningful, if narrow, answer to the
  planning doc's open question about whether the synthetic version of this
  defect behaves like the real one: here, because the role check is
  centralized in `runtime.js` rather than hand-written per route, there was
  no opportunity for an individual route to "forget" the check the way the
  synthetic SEC-01 defect simulated. The real risk surface for this defect
  class, in this architecture, is the `x-roles` contract declaration itself
  being wrong — which I checked by hand above — not the route code.

### 4. Privacy in telemetry and errors

- Re-checked OBS-021 against the MVP-02A code specifically (new since the
  audit doc's 2026-10-05 pass), since the brief asks not to trust it
  blindly: `services/reservation/server.js`'s `record_visit` (`:277-328`)
  puts only `visit.id` and the derived boolean `visit.notes_missing` on the
  span (`:323`) — `clinicalNotes`, `diagnoses`, `medications`, and
  `followUpNotes` never reach `app.attrs()`. `correct_visit` (`:333-354`)
  and `reassign_veterinarian` (`:355-385`) likewise only ever attribute
  IDs. `add_veterinarian`/`update_veterinarian` (`:85-108`) attribute only
  `veterinarian.id`. **Still followed** — the audit's conclusion holds for
  the new code.
- Error responses: **followed**. `runtime.js:537-546` builds the error body
  from `Problem.status`/`.code`/`.extra` for expected errors, and maps any
  non-`Problem` exception to a generic `internal_error` with no stack trace
  or internal identifier ever placed in the response body. The underlying
  exception is only `console.error`'d server-side (`client()`'s catch,
  `:358`).
- 404 vs 403 for resource existence: **followed**. `owner()`
  (`runtime.js:37-47`) always returns 404 for a customer accessing another
  customer's resource; `assigned()`/`assignedOrAdmin()`
  (`runtime.js:48-71`) return 403 for a veterinarian who exists and is
  authenticated but isn't the assigned one, which is correct per the
  contract's table (a veterinarian already knows other veterinarians'
  resources exist by design — "any customer, pet, reservation, visit,
  bill, or payment" — so 403 there doesn't leak anything a customer-facing
  404 is meant to hide).

### 5. Structure

- `bookingFeeAmount: 2000` and `hours = [8,9,10,11,13,14,15,16]`
  (`services/reservation/server.js:159,33`) are hardcoded, but they're
  documented clinic business rules (the $20 fee, office hours), not
  demo-only scenario values that should be config — not flagged.
- No duplicate payment-logic paths doing the same thing two different ways
  — `pay()` parameterizes cash vs. card with one `cash` flag rather than
  two separate implementations.
- Control flow: outcome computation in `runtime.js`'s `serve()` (the
  `ctx.outcome ??= ...` mapping, `:547-552`) is a little indirect but is
  already covered by the existing OBS-004 audit; nothing new found here.
- **New finding**: `active` on a veterinarian (`services/reservation/server.js`)
  is written (`:89`, `:420`) and updatable via `updateVeterinarian`
  (`:97-108`), and exposed on `GET /veterinarians`, but is never read by
  any booking-path code — see REV-003. This is a structural gap more than
  a boundary one: the data model supports the business rule but no code
  path enforces it.

## Findings

### REV-001 — Checkout `pay()` mutates the bill before confirming the downstream credit

- **Category**: Payment safety (§2).
- **File:line**: `services/checkout/server.js:351-357`.
- **What I found**: In `pay()`, when a card or cash payment is accepted,
  `c.paymentAttempts.push(a)` and, if paid, `c.previouslyPaidAmount += a.amount; remaining(c);`
  run *before* `await account(c, "credit", a.amount, a.attemptId)` — the
  call that actually records the credit on the Customer service, the
  system of record for the customer's balance. `c` is the live object
  stored in the `bills` map (not a copy), so these mutations are visible
  to any concurrent `GET /checkouts/{id}` immediately, before the
  downstream call is even attempted. If `account()` then throws (a
  `dependency_failed`/502), the catch block correctly reports
  `authorized_completion_failed` to the caller and records it for replay
  — but it never undoes the optimistic `previouslyPaidAmount`/`remaining(c)`
  mutation. From then on, Checkout's own bill record permanently
  understates the customer's true remaining balance relative to what
  Customer's ledger actually has recorded, with no path back to
  consistency short of someone reading the code and manually reconciling
  both services' state. This doesn't cause a double charge (idempotency
  replay still protects against that), but it does corrupt the one
  record (`GET /checkouts/{checkoutId}`) a human would check during the
  "manual recovery" the contract calls for on this exact failure mode.
- **Severity**: high.
- **Needs human sign-off?**: yes (payment safety).
- **Suggested fix**: don't mutate `c.previouslyPaidAmount` (or call
  `remaining(c)`) until `account()` has resolved successfully — compute
  the new balance into a local value, call `account()` first, and only
  then assign it onto `c`. If `account()` must be called with the
  post-payment balance already reflected (not clear from the code that it
  does), then roll the mutation back in the catch block instead.

### REV-002 — Checkout `apply_promotion` has the same pattern, with a worse failure signature

- **Category**: Payment safety (§2).
- **File:line**: `services/checkout/server.js:296-298`.
- **What I found**: `c.promotion = promotion; remaining(c);` run before
  `await account(c, "discount", promotion.appliedAmount)`. Unlike `pay()`,
  this route has no dedicated try/catch around the mutation, so if
  `account()` throws, the thrown `Problem` propagates to the generic
  handler in `runtime.js`, which reports outcome `failed` (not
  `authorized_completion_failed` — there's no such concept for discounts
  in the OBS-030 outcome enum). Worse: because `c.promotion` is already
  set, this route has no idempotency key and instead uses
  `if (c.promotion) fail(409, "already_applied")` as its de-facto replay
  guard (`:284`). A retry after the failure gets `already_applied` — which
  reads as success-already-happened — even though Customer's ledger was
  never actually credited with the discount. There is no record anywhere
  (response, telemetry, or a subsequent call) that distinguishes "the
  discount was truly applied" from "the discount object was created
  locally but the downstream write failed."
- **Severity**: high.
- **Needs human sign-off?**: yes (payment safety).
- **Suggested fix**: same shape as REV-001 — don't set `c.promotion` /
  call `remaining(c)` until `account()` confirms the discount, or roll
  back `c.promotion` in a catch block and report a status that doesn't
  read as "already applied" on retry.

### REV-003 — A deactivated veterinarian can still be newly booked and can still self-reassign

- **Category**: Structure / business-logic correctness (closest checklist
  fit: §1 and §5 — doesn't map cleanly onto one section; see note at the
  end of this report).
- **File:line**: `services/reservation/server.js:144-146` (`POST /reservations`
  veterinarian existence check), `:109-133` (`GET /availability`),
  `:355-385` (`reassign_veterinarian`), `:79-83` (`vetById`).
- **What I found**: `active` is written when a veterinarian is created
  (`:89`, default `true`) and seeded (`:420`), and can be flipped by
  `PATCH /veterinarians/{id}` (`updateVeterinarian`, `:97-108`,
  `Object.assign(v, body)`). I grepped the whole file for every read of
  `.active` and found exactly the two writes above and zero reads outside
  them. Concretely:
  - `POST /reservations` only checks `vets.some((v) => v.id === body.veterinarianId)`
    (`:145`) — a deactivated veterinarian still passes this check, so a
    customer can request (and, once accepted, pay for) a brand-new
    appointment with a veterinarian the administrator just deactivated.
  - `GET /availability` (`:109-133`) filters the veterinarian list only by
    the `veterinarianId` query parameter, never by `.active` — deactivated
    veterinarians still appear with open slots.
  - `reassign_veterinarian` (`:355-385`) only checks role (`veterinarian`,
    via the route's `x-roles`) and that the claim is a self-claim
    (`:366-367`) — a veterinarian whose own account has just been
    deactivated can still self-assign themselves onto an existing
    reservation.
  - `vetById` (`:79-83`), used by `updateVeterinarian`, doesn't gate on
    `.active` either, but that's expected — reactivating a vet has to find
    them regardless of current status.
  This directly contradicts D-43 (`docs/specs/business-decisions.md:53`):
  "deactivating a veterinarian... blocks new assignment to them going
  forward only." I also checked
  `spec/features/reservation/manage-veterinarians.feature` end to end
  (98 lines) — every scenario there asserts that deactivation doesn't
  disturb *existing* reservations and that it's reflected in `GET
  /veterinarians`'s listing. No scenario asserts the "blocks new
  assignment" half of D-43 at all, for any of `POST /reservations`,
  `GET /availability`, or `reassign_veterinarian`. The behavior the
  decision record promises for "new assignment" is neither implemented
  nor tested.
- **Severity**: high. This is the entire practical purpose of the
  "deactivate" button on the admin roster screen — a clinic owner would
  reasonably expect deactivating a veterinarian (e.g., because they left)
  to stop new bookings landing on them, and it currently does not, with no
  test anywhere that would catch a demo walkthrough exposing this.
- **Needs human sign-off?**: yes — this is a real business-rule gap, not
  a disclosed/accepted risk like THREAT-01/02, and touches the admin
  feature's core value proposition.
- **Suggested fix**: add `v.active` checks to the veterinarian-existence
  check in `POST /reservations` (treat an inactive ID the same as an
  unknown one, or a distinct `validation_error`/`not_found`, whichever the
  product intends), filter `GET /availability`'s `vets` list by `.active`,
  and reject `reassign_veterinarian` when the claiming veterinarian is
  inactive. Add BDD coverage for "a deactivated veterinarian cannot be
  newly booked" and "a deactivated veterinarian cannot self-reassign"
  alongside the existing manage-veterinarians scenarios.

### REV-004 — Customer service's veterinarian list is a stale, seed-time-only copy of Reservation's live roster

- **Category**: Service boundaries (§1).
- **File:line**: `services/customer/server.js:11,19-21,210` (`vets`,
  `validateVet`, seeding) vs. `services/reservation/server.js:85-108`
  (`add_veterinarian`/`update_veterinarian`, the actual, mutable roster).
- **What I found**: Customer loads its own copy of the veterinarian list
  once, from the same seed file Reservation also seeds from
  (`app.seed("veterinarians")`, `customer/server.js:210`), and never
  refreshes it. `validateVet` (`:19-21`) — used by both `POST
  /auth/register` (`:52-86`, open/anonymous) and `PATCH
  /customers/{customerId}` (`:96-107`, for `preferredVeterinarianId`) —
  checks a candidate ID only against this frozen snapshot. Since MVP-02A
  made Reservation's roster mutable at runtime (D-42 lets an administrator
  add veterinarians beyond the original seed, D-43 lets one be
  deactivated), the two services' understanding of "which veterinarians
  exist" diverges the moment an admin acts: a veterinarian added after
  service startup can never be set as any customer's
  `preferredVeterinarianId` (Customer will reject it with
  `validation_error` indefinitely), and a veterinarian deactivated in
  Reservation remains perfectly valid as a new customer's preferred
  veterinarian in Customer, forever (reinforcing REV-003's gap from the
  other side). `customer.openapi.json:70`'s own description —
  "`preferredVeterinarianId` must be a seeded veterinarian" — is itself
  now stale language left over from before D-42, and is a textual hint
  this boundary was never revisited when the roster became dynamic.
- **Severity**: medium-high (correctness bug reachable from a public,
  anonymous endpoint — registration — not just an internal admin path).
- **Needs human sign-off?**: yes (service boundary).
- **Suggested fix**: Customer should treat Reservation as the single
  source of truth for the veterinarian roster and call it (e.g. `GET
  /veterinarians`, filtered to active) rather than keeping its own copy,
  consistent with the "single source of truth, others call it" rule in
  checklist §1. If a synchronous call per validation is too expensive,
  at minimum revisit `customer.openapi.json`'s description and treat this
  as a known limitation rather than silently shipping the earlier
  two-veterinarian-era assumption.

### REV-005 — Reservation similarly keeps its own static copy of the veterinarian-services catalog (currently low-risk, flagging as a latent instance of the same pattern)

- **Category**: Service boundaries (§1), note-level.
- **File:line**: `services/reservation/server.js:421` (`serviceIds = new
  Set(app.seed("services").map((s) => s.id))`), used at `:290-291` in
  `record_visit`.
- **What I found**: Same shape as REV-004 — Reservation seeds its own copy
  of veterinarian-services' catalog IDs once at startup rather than
  calling veterinarian-services, and uses it to validate
  `performedServices` on visit recording. Currently this is harmless
  because `services/veterinarian-services/server.js` has no "add a new
  service" endpoint (only `PATCH /services/{serviceId}` to edit an
  existing one, `:8-22`), so the catalog's ID set can't drift at runtime
  the way the veterinarian roster now can. I'm flagging it only because
  it's the same architectural pattern as REV-004 and would become a real
  bug the moment anyone adds a "create service" admin capability (a
  plausible next MVP-02-style feature) without also revisiting this line.
- **Severity**: low / note.
- **Needs human sign-off?**: no — informational, no current exploit or
  bug.
- **Suggested fix**: none needed now; worth a one-line comment at `:421`
  flagging the assumption ("safe only because the catalog is static — see
  REV-004 for what breaks if it stops being static") so a future change
  doesn't reintroduce REV-004's bug class here.

## What I re-verified from the existing audit without re-litigating it

- OBS-021 (privacy): re-checked against the new MVP-02A code paths
  specifically, as instructed, and found it still holds — see §4 above.
- OBS-046/047/048 (no dedicated observability test): confirmed still true
  (`spec/tests/observability/business-traces.test.js` has no match for
  any of the three IDs as of this read), consistent with
  `docs/engineering-reviews/eng-02-observability-audit.md`'s finding. Not
  re-reported as a new item — it's the same known gap.
- OBS-008 (exporter crash risk in production): re-read
  `runtime.js:117-133`; the test-harness-only scoping of the
  uncaught-exception/unhandled-rejection guard is unchanged and the
  production gap the earlier audit flagged still stands. Not re-reported
  as a new item.

## THREAT-01 / THREAT-02 — nothing new

Everything found during the §3 authentication review is consistent with
the already-disclosed shared-secret risk (THREAT-01) and dual-role blast
radius (THREAT-02); no new instance of either was found, and no new
authentication risk outside of those two was found.

## Suggested additions to the living checklist

Per `docs/design/eng-02-review.md`'s "living list" framing, two defect shapes
surfaced here that the current checklist (and six-item calibration list)
don't explicitly name:

1. **Optimistic local-state mutation ahead of a downstream confirmation
   call that can fail** (REV-001, REV-002) — a more general case than "does
   a retry cause a duplicate charge"; it's "does a *single, non-retried*
   failure leave one service's own record permanently wrong relative to
   the service it just called." Worth a dedicated checklist bullet under
   §2.
2. **A documented access-control or business-rule flag that exists in the
   data model and admin UI but is never actually read by the code paths it
   is supposed to constrain** (REV-003) — different from "missing a role
   check" (which is about *authentication*); this is about a *business
   rule* (not a security boundary) silently not being wired up anywhere,
   despite being named, tested-for-its-own-sake (the flag itself is
   tested), and demoed. Worth a bullet under §5, phrased something like:
   "for every field an admin can set that is supposed to constrain future
   behavior, grep for every place that field is read, not just where it is
   written."

I did not add these to `tools/review/review-prompt.md` myself — that file
is explicitly protected/CODEOWNERS-gated, and per this review's own
instructions I'm not to edit anything but this record.

## Overall assessment

Sections 1, 3, and 4 of the checklist are in good shape: the hand-rolled
JWT auth code is careful (constant-time comparison, pinned algorithm,
validated claims, consistent dual-role handling, no missing role checks on
any admin/internal route I checked), and telemetry privacy holds for the
new MVP-02A code. Section 2 (payment safety) and the business-logic half
of section 1/5 have two high-severity, concretely-cited gaps apiece
(REV-001/002 and REV-003/004) that were not caught by the existing test
suite or prior reviews, because none of the current tests exercise "a
downstream write fails after a payment/discount succeeds, then read the
bill back" or "book/reassign against a deactivated veterinarian." None of
these are exotic to find — they follow directly from reading the affected
functions start to finish — which suggests the gap is in test coverage of
these exact scenarios, not in the difficulty of spotting them.

**Recommendation**: REV-001, REV-002, REV-003, and REV-004 should all get
human sign-off before this build is called demo-ready, per ENG-02's
governance model (security/boundary findings require sign-off). REV-003 in
particular should be prioritized — it's the one most likely to surface
visibly during an actual demo walkthrough of the admin roster feature.

## Disposition (2026-10-05, after sign-off)

- **REV-001 — fixed.** `services/checkout/server.js`'s `pay()` now calls
  `account()` before mutating `c.previouslyPaidAmount`/`remaining(c)`.
  Regression test added: "Payment succeeds but the account credit fails"
  (`spec/features/checkout/visit-payment.feature`), confirmed red against
  the pre-fix code and green after.
- **REV-004 — fixed.** `services/customer/server.js`'s `validateVet` now
  calls Reservation's `GET /veterinarians` (already `x-roles: ["service"]`
  accessible, no contract change needed) instead of its own seed-time
  snapshot, and only accepts an `active` veterinarian. `spec/harness/config.js`
  gained `reservation` as a declared dependency of `customer`. Two
  regression tests added to `spec/features/customer/customer-profile.feature`
  ("A veterinarian added after startup can be chosen as preferred", "A
  deactivated veterinarian can no longer be chosen as preferred"), both
  confirmed red against the pre-fix code and green after.
- **REV-002 — fixed (2026-10-05, second pass).** Same shape as REV-001:
  `apply_promotion` now calls `account()` before setting `c.promotion`/
  `remaining(c)`. Regression test added: "A promotion that fails to record
  with Customer is not left applied"
  (`spec/features/checkout/promotion.feature`), confirmed red pre-fix,
  green post-fix.
- **REV-003 — fixed (2026-10-05, second pass).** `services/reservation/server.js`
  now checks `.active` in `POST /reservations` (treats an inactive ID as
  `not_found`), `GET /availability` (filters inactive veterinarians out of
  every date's slots), and `reassign_veterinarian` (rejects a self-claim
  from a now-inactive veterinarian as `validation_error`). Recorded as D-57.
  Three regression tests added across `request-reservation.feature`,
  `calendar-availability.feature`, and `reassign-veterinarian.feature`, all
  confirmed red pre-fix, green post-fix.
- **REV-005 — addressed per its own recommendation (2026-10-05, second
  pass).** The review's suggested fix was explicitly "none needed now,"
  just a comment flagging the assumption for whoever adds a "create
  service" endpoint later. Added that comment at
  `services/reservation/server.js`'s `serviceIds` seed line. No behavior
  change, since no code change was actually recommended.

Verification run after all five fixes: full `test:bdd` across every
service (267/267, up from 260 before this round's 7 new regression
scenarios), `test:schema` (169/169), workflows/backend journeys (9/9),
`test:runtime` (52/52), `test:harness` (44/45 — one pre-existing, unrelated
failure, see below), and a partial `test:observability` run (78/78 before
hitting this sandbox's time budget, none in the affected code paths). Full
`test:auth` (242 cases) was not completed in this sandbox — each case
takes ~1.6s and the suite's total runtime exceeds this environment's
per-command time budget; this suite is unrelated to any of these fixes
(pure JWT validation, untouched by this change) and should be run as part
of the next full local `npm test`.

**Pre-existing, unrelated test-harness gap (not fixed, flagged for your own
review per your request):** `spec/tests/harness/assertion-slices.test.js:44`
("`[TEST-01] business span names and outcome registries match the
observability document`") fails because its expected-outcomes source,
`spec/tests/support/business-traces.js:12` (the `OBS-027` entry in the
`rules` table), lists `recorded already_recorded not_assigned_veterinarian
invalid_state unknown_service not_found failed` — missing `validation_error`,
which MVP-02A's D-47 added to `docs/observability.md`'s actual OBS-027 row
(an administrator bypass supplying clinical content). Confirmed via `git
stash` that this already failed before any of this session's REV-fixes —
not a regression from this work. This is not really a "stale test to
delete": the test itself is doing its job (catching a real registry gap);
the thing that's stale is the one line in `business-traces.js`. Three
options, your call: (1) add `validation_error` to that line so the test
passes and the registry is accurate again, (2) delete the whole
`rules["OBS-027"]` entry and this test's coverage of it if you've decided
this cross-check isn't worth maintaining, or (3) leave it red as a known,
tracked gap. I have not touched either file.
