# MVP-02A + SPEC-06 planning: administrator role and veterinarian roster

Status: [MVP-02A](../history/backlog-completed.md#mvp-02a--administrator-role-and-veterinarian-roster)
is complete; this is the planning record. This is a working
document, not a protected spec — `docs/specs/business-decisions.md` stays the
single source of truth for frozen decisions. Nothing here authorizes any
feature file, contract, or test change. Once the open question at the bottom
is settled, the candidate decisions below get folded into
`docs/specs/business-decisions.md` for your review and freeze, the normal way.

Why this item matters beyond the feature itself: this is the first time the
project evolves an already-tested, already-frozen system rather than building
from a clean spec. That's worth being explicit about in the November talk —
candidate framing: "here's what changes, and doesn't, when you add a feature
to a system with frozen contracts and protected tests, instead of writing
requirements from scratch."

## What's currently true (confirmed by reading the repo, 2026-10-04)

- The veterinarian roster lives in **Reservation**'s contract
  (`GET /veterinarians`), not VeterinarianServices. VeterinarianServices only
  owns the fee catalog. So "admin manages veterinarians" is Reservation work,
  not a VeterinarianServices change.
- D-04 hard-codes "at most two veterinarians, each with one office" directly
  into Reservation's capacity/availability logic. D-25 (no overlapping
  Accepted reservations for a pet across vets) is written generically enough
  that it doesn't need to change when the roster grows — it already operates
  per-veterinarian, not against a hardcoded count of two. That's a genuinely
  good finding: lifting the cap is more contained than it first looks.
- Auth has exactly two user roles today (`veterinarian`, `customer`) plus
  internal `service` tokens (`auth-contract.md`). No `administrator` role,
  no access-rule row for one, no precedent for a user holding two roles at
  once.
- D-16 ("only the assigned veterinarian accepts/denies") and D-31 ("only the
  assigned veterinarian records a visit") are enforced in Reservation; D-26
  (promotion) and D-19 (cash) are enforced in Checkout. All four checks
  assume exactly one authorized actor per visit — the assigned veterinarian.
- GAP-08 (missing OBS-030/033 outcome entries for the `not_assigned_veterinarian`
  denial) and GAP-08a (can an admin act on any visit?) were already sitting in
  the backlog as open MVP-02A questions before this session; GAP-08a is now
  answered below.
- SEC-01's calibration defect #5 ("a route that skips the auth hook") was the
  one class none of the automated scanners could catch — `calibration-defects.md`
  flags it as needing a route-vs-contract cross-check that doesn't exist yet.
  Every new admin-only route this feature adds is a live instance of exactly
  that defect class. This is the first real opportunity to build that engine
  for ENG-02, not a hypothetical one.

## Decisions made this session (pending formal write-up and freeze)

| # (draft) | Decision |
| --- | --- |
| D-39 (draft) | `administrator` is a new, separate auth role (not a flag on `veterinarian`). Access-rule table in `auth-contract.md` gets a new row. |
| D-40 (draft) | Exactly one person for now — the clinic's owner — holds **both** `administrator` and `veterinarian` roles. No "promote another vet to admin" operation is built for November; that's deferred if the pattern needs to generalize later. |
| D-41 (draft) | When acting in **admin view**, the owner can act on any visit regardless of assignment — accept/deny, record a visit, apply a promotion, record cash — bypassing the normal assigned-veterinarian-only rule. Acting in **veterinarian view**, they're bound by the same assigned-only rule as any other veterinarian. This means D-16/D-31/D-26/D-19's checks each need an explicit "or caller has the administrator role" clause, not a removal of the existing rule. |
| D-42 (draft) | D-04's "at most two veterinarians" cap is lifted entirely. An administrator can add any number of veterinarians; each new veterinarian is assigned an office at creation (office-assignment scheme is an open design detail, not a business decision — see gap table below). |
| D-43 (draft) | Deactivating a veterinarian has no cascading effects: it blocks new assignment to them going forward only. Their existing future Accepted reservations and visits proceed unchanged. A customer whose preferred veterinarian becomes inactive is not forced to change it immediately — they pick a new one whenever they next need to (e.g. next booking that would otherwise default to the inactive vet). |
| D-44 (draft) | The dual-role account carries both roles in a single JWT (array/second claim), not two separate logins. Switching between admin and veterinarian view is a frontend-only affordance; the backend authorizes off whichever role the action needs. Disclosed limitation: a stolen token for this one account grants both privilege levels at once. |

## Resolved: dual-role mechanism (2026-10-04)

**Decision: option 1, one token with two roles.** The JWT's `role` claim
becomes an array (or a second claim) containing both `administrator` and
`veterinarian`. The frontend's "view switch" is a pure UI affordance — it
doesn't re-authenticate, it just changes which screen is shown; the backend
authorizes based on whichever role an action requires, and the token always
carries both. Simpler to build and demo live than a two-login model.

Disclosed tradeoff, to go in ENG-02's threat-model note alongside the
existing single-shared-HS256-secret limitation (A-09): a single stolen owner
token now grants both privilege levels at once. Accepted and disclosed
rather than engineered around, consistent with this project's existing demo-
security posture — this is still an explicit, documented boundary, not a
silent gap.

This is still a protected-contract change (`auth-contract.md`,
`auth.openapi.json`) and needs the normal human review/freeze step before
any test or implementation work starts against it.

## Gap-to-artifact map: what each affected check type needs

| Check type | What needs to change | Notes |
| --- | --- | --- |
| **Features** (`spec/features/`) | New: veterinarian roster add/deactivate scenarios (Reservation). New: admin-acts-on-unassigned-visit scenarios (workflow-level, since it crosses Reservation/Checkout). Amend: any existing scenario whose Given/Then assumes exactly two named veterinarians. | Check `spec/features/reservation/` and `spec/features/workflows/` for hardcoded two-vet assumptions before amending — don't assume none exist. |
| **API contracts** (`spec/contracts/`) | `reservation.openapi.json`: new `POST /veterinarians` and a deactivate operation, both `x-roles: ["administrator"]`. `domain.openapi.json`: `VeterinarianRead` needs an active/inactive field; new `VeterinarianCreate` schema. `auth.openapi.json`/`auth-contract.md`: new role row, resolve the dual-role question above. Checkout and Reservation's existing promotion/cash/accept/deny/record operations: add the administrator-bypass clause to each `x-roles` list and to their written authorization description. | Every one of these admin-only or admin-bypass routes is the direct, real-world version of SEC-01 calibration defect #5 — worth treating this contract work as the test case for ENG-02's route-vs-contract cross-check. |
| **Security** (ENG-02) | Build (or at least prototype) the route-vs-contract cross-check here, since it now has real routes to check instead of a hypothetical. Add to the threat-model note: dual-role token blast radius (per the open question above), and a new calibration defect candidate — "admin-only route missing its role check" — using SEC-01's methodology. | This is the strongest "fold into the talk" material: a security gate built specifically because this feature made its gap concrete, not planted artificially. |
| **Performance** (PERF-01) | None expected. A larger roster trivially increases availability-computation work at this demo scale; worth one line in the write-up confirming no new threshold is needed, not a new test. | — |
| **Observability** (`docs/observability.md`) | New OBS rule(s): roster mutation events (vet added/deactivated — who, when). Extend the existing `not_assigned_veterinarian` denial-outcome telemetry (GAP-08) to add an `administrator_override` outcome so an admin acting on someone else's visit is distinguishable in traces from the normal assigned-veterinarian path — audit evidence, not just access control. | This directly closes GAP-08 as a side effect, and gives the talk a concrete "we can prove who actually did what" moment. |
| **Frontend** | Admin screen: add/deactivate veterinarian, accessible labels, browser check. View-switch control for the dual-role account. | Already scoped in BACKLOG.md's MVP-02A section; no change needed there beyond what's above. |

## Explicitly not changing

VeterinarianServices (fee catalog) is unaffected — administrator access to
edit fees wasn't asked for and isn't assumed here; flag separately if you
want it. D-25's double-booking check needs no rewrite — it already
generalizes to any roster size. No new persistence/durability work; still
in-memory per the project's standing scope limits.

## Resolved: clinical-notes attribution and scope expansion (2026-10-04)

The open question flagged earlier ("does an admin-recorded visit attribute
the acting administrator or the originally assigned veterinarian?") is now
moot, not answered — D-47 settled that an administrator can never supply
clinical content at all, so there's no attribution left to decide. This also
corrected an earlier mistake: the admin-bypass scenario originally written
for `recordVisit` had the administrator supplying clinical notes, which is
now explicitly disallowed; it's been rewritten in
`spec/features/reservation/record-visit.feature`.

Significant scope addition this session, recorded as D-45–D-50 in
`business-decisions.md`: clinical notes are locked to a visit's specific
attributed veterinarian, not administrators and not "any veterinarian";
`clinicalNotes` became optional at close/record time (with a `notesMissing`
flag instead of a hard rejection); a veterinarian may reassign ("fill in")
a reservation to themselves, self-claim only; and the project's first
report (`GET /reports/visits-missing-notes`) now exists in contract form.
New feature files: `spec/features/reservation/reassign-veterinarian.feature`
and `spec/features/reservation/visits-missing-notes-report.feature`.

**Revision (2026-10-04):** the assumption above — that reassignment only
works before a visit is recorded — was wrong and has been corrected (D-48,
revised; new D-51, D-52). The real gate is whether clinical notes exist
yet, not whether a visit has been recorded. Emergencies, appointment
overruns, and delayed paperwork mean a visit is routinely closed without
notes (D-46 made that possible); a different veterinarian can still fill in
after that, right up until notes are actually written, at which point the
lock is permanent regardless of the reservation's financial state (D-51).
Also added: a seeded administrator-only account with no veterinarian
identity (`riley.chen`, D-52), proving roster management and the
admin-bypass on closing visits never depended on also holding the
veterinarian role — covered in `manage-veterinarians.feature`,
`record-visit.feature`, and `reassign-veterinarian.feature`.
