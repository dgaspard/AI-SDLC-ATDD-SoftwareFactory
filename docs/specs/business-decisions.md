# SPEC-01 — Business decision record

Status: user decisions captured; explicit follow-up questions remain. This record
supersedes the earlier proposed pay-to-confirm booking flow. It does not change
the current implementation, feature files, or existing published contract.

## Confirmed direction

| Decision | User-specified behavior |
| --- | --- |
| D-01 | A customer is a pet owner with one or multiple pets and an optional secondary contact. Each reservation references one customer and one pet. |
| D-02 | Reservations and visits are separate. A visit documents customer/animal interactions, medicines, diagnoses, and follow-up if necessary. Every visit ends in checkout, including a $0.00 visit. |
| D-03 | Appointments occupy one-hour slots Monday–Friday, 08:00–12:00 or 13:00–17:00 in US Central Time (use America/Chicago, including daylight saving). Lunch 12:00–13:00 is unavailable. Valid start hours are 08, 09, 10, 11, 13, 14, 15, and 16. |
| D-04 | At most two veterinarians, each with one office. A veterinarian can serve only one visit at a time. For competing requests, the first approved reservation wins; the second request for that capacity is denied. |
| D-05 | Reservation states: Requested, Accepted, Denied, Canceled, CompletedSettled, CompletedOutstanding. Explicit transitions: Requested → Accepted or Denied; Accepted → Canceled, CompletedSettled, or CompletedOutstanding. Accepted consumes veterinarian capacity; Requested does not. Moving an appointment means cancelling it and requesting another. Unpaid completion blocks new booking until the account is paid; the customer retries with a different payment method, or the veterinarian marks cash payment as paid. |
| D-06 | Reservations do not expire. They remain in their prescribed states; no hold-expiration mechanism. |
| D-07 | VeterinarianServices owns fees, retrieved by Checkout, in USD. The $20 booking fee is paid when the reservation is accepted and is non-refundable on cancellation. Five service prices are defined below. |
| D-08 | Successful payment means authorization. Subsequent collection/capture of failed payments is outside demo scope; confirm terminology if “claiming failed payments” meant something else. |
| D-09 | Confirmed replacement of the earlier decline rule: post-visit payment decline produces CompletedOutstanding, not Denied. CompletedOutstanding means an actual unpaid balance. A customer owing $0 remains in good standing; Denied describes rejected reservation requests. |
| D-10 | Recovery after successful authorization and failed subsequent confirmation is manual. With checkout after the visit, define exactly which completion write can fail and what is reported. |
| D-11 | Payment timeout handling is outside demo scope. The user manually checks their bank account. No automatic reconciliation or retry policy is implied. |
| D-12 | Approved: repeated identical checkout requests return the same result while authorizing payment only once, including concurrent requests. The user delegated a practical mock key convention; see below. A new attempt after decline uses a different payment method. |
| D-13 | Customer owns outstanding balances. Customer profile includes name, address, phone number, emergency contact, billing information, insurance if applicable; pets include name, type, age, breed. Earlier requested medical history remains part of the domain; veterinarian owns clinical records. Customers with unpaid prior balances cannot reserve until paid. A reservation may be cancelled before its start. |
| D-14 | Approved requirement change: the new cancellation feature cancels the reservation and releases its veterinarian/time slot while preserving clinical records. Cancellation is permitted before the reservation starts; the paid booking fee is retained. Existing visit-deletion expectations need an explicit specification migration, not application to clinical records. |
| D-15 | Primary demo: delete Checkout, show the broken workflow, and have the agent reconstruct it until all tests pass. Audience-proposed feature changes are a possible extension; scope may evolve. |
| D-16 | Veterinarians accept or deny their own reservation requests. There is no automatic acceptance and no staff role. A veterinarian cannot accept or deny a request assigned to another veterinarian. |
| D-17 | A customer chooses a veterinarian when creating their customer profile. That veterinarian is the default for new reservation requests; the customer may request the other veterinarian for a given appointment. |
| D-18 | Reservations whose scheduledStart is in the past are not allowed. |
| D-19 | If an electronic payment fails, the customer may pay in cash. The veterinarian manually records the cash payment, bringing the amount owed for that visit to $0. Cash recording never calls the fake payment provider. |
| D-20 | A customer with a positive outstanding balance has their reservation request denied with the message "Please pay your full balance of $X" (format per D-27). The system stores the reservation immediately in Denied state with that reason, so it appears in history. This is the only automatic denial; all other accept/deny decisions belong to the veterinarian (D-16). |
| D-23 | The $20 booking fee must be paid before acceptance takes effect. If the electronic booking payment fails, the reservation stays Requested and consumes no capacity until the fee is paid with another method or recorded as cash by the veterinarian (D-19). Acceptance and capacity are applied only after payment succeeds. |
| D-25 | A pet cannot have Accepted reservations with both veterinarians at overlapping times. A pet may have at most one Accepted reservation per time slot, checked at request and again at acceptance. |
| D-26 | Promotion: the veterinarian may apply at most one promotion to a visit to reduce its remaining balance. The veterinarian enters a positive discount of at least 1 cent (D-65 supersedes the original $0 default). If the promotion exceeds the amount owed, the amount owed becomes $0; the excess is discarded. A customer can never owe a negative amount, and no refund or credit results. The prepaid $20 booking fee is never refunded by a promotion. |
| D-27 | Balance denial message is exactly `Please pay your full balance of $X`, where X is the customer's total outstanding balance across all pets, formatted with a thousands comma and two decimals (for example `$1,234.50`, `$50.00`). |
| D-28 | Service feature files assert only the owning service's state plus the requests it sends to other services. Cross-service end results belong in workflow feature files. Each service can therefore be tested, deleted, and rebuilt on its own. |
| D-29 | If a veterinarian tries to accept a request whose slot is already taken by another Accepted reservation, the system automatically sets the request to Denied (consistent with D-04). |
| D-30 | The customer or the assigned veterinarian can cancel an Accepted reservation before it starts. |
| D-31 | Only the assigned veterinarian can record a visit, only for an Accepted reservation, and only at or after its scheduledStart. |
| D-32 | Checkout owns all payments, including the $20 booking fee and cash recording for it. On acceptance, Reservation asks Checkout to collect the booking fee and accepts only if it is paid. |
| D-33 | Requests that break calendar rules (weekend, lunch, non-slot hour, past start) or would double-book the pet are rejected with a validation error and are not saved. Only outstanding-balance denials are saved as Denied (D-20). |
| D-34 | An applied promotion is final: it cannot be changed or removed. D-65 supersedes the original $0-promotion rule: zero or missing amounts are rejected and do not consume the promotion. |
| D-35 | Service feature files live in `spec/features/<service>/`; workflow files in `spec/features/workflows/` (moved under `spec/` by ARCH-01). |
| D-36 | The veterinarian who performed the visit finalizes the bill. Completion is automatic: whenever a payment, cash recording, or promotion brings the remaining balance to $0, Checkout completes the reservation as CompletedSettled without further action. |
| D-37 | No new cross-service dependencies. Reservation does not validate requested service IDs against VeterinarianServices; it checks only that the list is nonempty and has no duplicates. Performed services are priced (and unknown IDs rejected) by Checkout at bill finalization. |
| D-38 | Customer does not depend on Reservation. A customer can exist without any reservation. Customer and Pet hold no reservations, visits, or visit history; those records reference the customer and pet and are owned and queried through Reservation. Supersedes the earlier Customer.reservations, Customer.visits, and Pet.history read views. |
| D-24 | The new four-service application replaces the legacy app. Legacy tests and behavior remain preserved at tag `1.0` as history but are not part of the new suite and need no migration. |
| D-21 | Owner and customer are the same entity. Customers own pets. There is no separate Owner entity in the new domain. |
| D-22 | Requests outside the calendar (for example, a Saturday such as 2026-10-10) are valid negative scenarios: the specification expects them to be rejected. |
| D-39 | MVP-02A: `administrator` is a new, separate auth role (not a flag on `veterinarian`). The access-rules table in the auth contract gets a new row for it. |
| D-40 | MVP-02A: exactly one person — the clinic's owner — holds both `administrator` and `veterinarian` roles for now. No "promote another veterinarian to admin" operation is built for this MVP. |
| D-41 | MVP-02A: in **admin view**, the dual-role owner can act on any visit regardless of assignment — accept/deny, close/record a visit, apply a promotion, record cash — bypassing the normal assigned-veterinarian-only rule (D-16, D-31, D-26, D-19). In **veterinarian view**, they're bound by the same assigned-only rule as any other veterinarian. Each of those four rules needs an explicit "or caller has the administrator role" clause, not a removal of the existing rule. **Refined by D-47:** the recordVisit bypass is narrower than the others — administrator may close/record a visit, but may never supply clinical content (clinicalNotes, diagnoses, medications, followUpNotes). Accept/deny, promotion, and cash recording remain fully bypassable with no such carve-out. |
| D-42 | MVP-02A: supersedes D-04's "at most two veterinarians, one office each" cap. An administrator may add any number of veterinarians; each new veterinarian is assigned an office at creation. D-04's other content (one office per veterinarian, one visit at a time, first-approved-wins for competing requests) is unchanged and still applies per veterinarian regardless of roster size. |
| D-43 | MVP-02A: deactivating a veterinarian has no cascading effects. It blocks new assignment to them going forward only; their existing future Accepted reservations and visits proceed unchanged. A customer whose preferred veterinarian becomes inactive is not forced to change it immediately — they pick a new one whenever they next need to. |
| D-44 | MVP-02A: the dual-role (admin + veterinarian) account carries both roles in a single JWT (array or second claim), not two separate logins. Switching between admin and veterinarian view is a frontend-only affordance; the backend authorizes off whichever role the action needs. Disclosed limitation, recorded as `THREAT-02` in `tools/review/project-specific/threat-model.md`: a stolen token for this one account grants both privilege levels at once — accepted and disclosed rather than engineered around, consistent with this project's existing demo-security posture (`THREAT-01`, A-09's shared HS256 secret). |
| D-45 | MVP-02A: clinical notes are locked to a visit's specific attributed veterinarian (the visit's `veterinarianId`), not "any veterinarian." Only that one veterinarian may write or correct `clinicalNotes`, `diagnoses`, `medications`, or `followUpNotes` — this is a medical-diagnosis record, not a general clinical task. The dual-role owner can only write notes through her veterinarian identity, on visits attributed to her; her administrator role never grants note-writing access, including on her own account. |
| D-46 | MVP-02A: `clinicalNotes` becomes optional when closing/recording a visit (previously required). Omitting it is allowed and does not block closing the appointment; it returns a non-blocking warning (`missing_clinical_notes`) in the response and is recorded in telemetry. `VisitRead` gains a computed `notesMissing` boolean so this is queryable later (feeds D-50's report), not only visible at the moment of creation. |
| D-47 | MVP-02A: administrator may close/record a visit (bypassing the assigned-veterinarian check, per D-41) but may never supply `clinicalNotes`, `diagnoses`, `medications`, or `followUpNotes` in that call — any attempt is rejected. An account holding only the administrator role (no veterinarian role) can never write or correct notes under any circumstance. |
| D-48 | MVP-02A, revised 2026-10-04: whoever a reservation was originally booked with is the default attributed veterinarian. Another veterinarian may "fill in" by reassigning to themselves — self-claim only, never a third party, never performable by an administrator acting alone (the caller must hold the veterinarian role). **Revision:** reassignment is not limited to before the visit is recorded. It's permitted any time no clinical notes exist yet — including after a visit was closed without notes (D-46), covering real-world cases: emergencies, appointment overruns, delayed paperwork. Once clinical notes exist for a visit, reassignment is permanently blocked for it, regardless of the reservation's financial completion state (D-51). This replaces the earlier "locked once recorded" default, which was my own reasoned assumption, not a confirmed decision — correcting it now rather than leaving it. |
| D-49 | MVP-02A: veterinarian-reassignment is its own distinct telemetry event, separate from acceptance, denial, or visit-recording, so it can be traced independently. |
| D-50 | MVP-02A: first report — completed visits missing clinical notes — is a new read-only API endpoint (`GET /reports/visits-missing-notes` on Reservation), establishing the pattern future reports follow (contract + BDD feature + tests, same as every other capability here, not a special-cased artifact). |
| D-51 | MVP-02A: once a veterinarian has written clinical notes on a visit, no other veterinarian can claim it (D-48) or write/correct its notes (D-45) — the lock is permanent and keyed only on "do notes exist," not on reservation state, financial completion, or time elapsed. |
| D-52 | MVP-02A: an administrator-only account (no veterinarian role at all) is a real, seeded, tested case — not just a theoretical one covered by the dual-role owner's negative-control scenarios. Such an account can still perform every non-clinical bypass action (accept/deny, close a visit without notes, apply a promotion, record cash) but can never write or correct notes and can never reassign a visit's veterinarian, exactly as any administrator-only caller — dual-role or not — cannot. |
| D-53 | MVP-02A frontend, draft 2026-10-04: a dual-role account (administrator + veterinarian, D-40/D-44) sees the union of both roles' UI simultaneously — every nav link and action either role unlocks — rather than a toggle or separate "admin view." This reconciles D-44's "switching view is a frontend-only affordance" wording: "switching" means which actions apply to a given screen, not a mode switch control. FE-01's existing "never add a role toggle" line is read narrowly — it forbids a client-invented role, not role-gated UI for roles the backend actually issued. An administrator-only account (D-52, no veterinarian identity) still reaches `/appointments` to use bypass actions, labeled with a "CLINIC ADMINISTRATION" workspace eyebrow instead of "CUSTOMER PORTAL"/"VETERINARIAN WORKSPACE". |
| D-54 | MVP-02A frontend, draft: roster management (`/veterinarians`) and the visits-missing-notes report (`/reports/visits-missing-notes`) are new dedicated pages, reached by nav links ("Veterinarians", "Reports") that render only for a signed-in account holding the administrator role (primary or via D-53's dual role). |
| D-55 | MVP-02A frontend, draft: administrator bypass actions (accept/deny a reservation, record/close a visit, apply a promotion, record cash) are surfaced inline on the existing Appointments list/detail and Record Visit screens — not a separate admin dashboard — appearing whenever the signed-in account holds the administrator role and is not the assigned veterinarian. The clinical-notes field is omitted entirely from the bypass Record Visit form (D-47 forbids submitting it), replaced by a short notice that the visit will be flagged as missing notes. |
| D-56 | MVP-02A frontend, draft, revised 2026-10-04: the reassign-veterinarian control lives on the Appointment detail screen (S2), for an Accepted reservation with no clinical notes recorded yet (D-48/D-51). Any veterinarian other than the one currently assigned sees "Reassign to me" (self-claim only, D-48). **Correction:** the backend's `PATCH /reservations/{id}/veterinarian` rejects any `veterinarianId` other than the caller's own — there is no "assign to a third party" capability at all, for any caller. My first draft of this decision proposed an administrator vet-picker ("Reassign to…any active veterinarian"); that doesn't match the deployed contract and is withdrawn. An administrator-only account (no veterinarian identity) sees no reassignment control whatsoever, exactly as D-48 already says ("never performable by an administrator acting alone"); only the dual-role owner can self-claim, and only through her own veterinarian identity, same as any single-role veterinarian. Once notes exist, no reassignment control renders for anyone, instead of a disabled one, matching D-51's permanent lock. |
| D-57 | ENG-02 REV-003 fix, 2026-10-05: D-43's "blocks new assignment going forward" is now actually enforced everywhere a veterinarian could be newly assigned, not just understood as intent. `POST /reservations` treats a deactivated veterinarian ID exactly like an unknown one (`404 not_found` — the roster's status is not leaked to the caller). `GET /availability` excludes a deactivated veterinarian's slots entirely, as if they didn't exist for that date. `PATCH /reservations/{id}/veterinarian` (self-claim reassignment, D-48) rejects the claim with `400 validation_error` — the same code already used for "not a self-claim," since a deactivated veterinarian's claim is equally not a valid one. None of these needed a contract change (both operations already declared 400/404 among their documented responses); this was purely an enforcement gap in the implementation, found by ENG-02's independent review (`docs/engineering-reviews/eng-02-review-impl-02-2026-10-05.md`, REV-003). |
| D-58 | SPEC-06 GAP-08, accepted 2026-10-05: `not_assigned_veterinarian` is a business outcome of `apply_promotion` (OBS-030) and `record_cash` (OBS-033). It is added to both closed outcome lists, and each gets a trace test. The code already emits it; the contract catches up. |
| D-59 | SPEC-06 GAP-09, accepted 2026-10-05: when the money step succeeds but Reservation can't record completion, the response is an honest 502, never success. Promotion returns `502 dependency_failed` (the discount is already applied to the bill and Customer). Cash returns `502 authorized_completion_failed` with `paymentAttemptId`, the same as card: "authorized" means the money step was accepted, not specifically a card network. Both contracts add 502. No automatic recovery (THREAT-03). |
| D-60 | SPEC-06 GAP-10, accepted 2026-10-05: an unexpected server failure returns `500 internal_error`. `internal_error` is added to `ProblemCode`, and 500 is added to the common status-code list as "unexpected server failure." The body never includes stack traces or internal detail. It is never reported as `dependency_failed`, because no dependency may be at fault. |
| D-61 | SPEC-06 GAP-11, accepted 2026-10-05. Confirmed: a bill reaching $0 completes the reservation as `CompletedSettled`. The booking fee counts toward `previouslyPaidAmount` but is not listed in the bill's `paymentAttempts`. **Corrected from the rebuilds' guess:** a same-key replay of a visit payment returns exactly the original response (the bill as it was then, plus the original attempt) with `replayed: true`, not the bill's current state. |
| D-62 | SPEC-06 GAP-12, accepted 2026-10-05 (clarifies D-12): booking-fee keys are scoped per reservation; card and cash keys are scoped per bill. The same key used for a booking fee and for a visit payment makes two independent requests. The same key reused across card and cash on one bill is `409 idempotency_conflict` (different request body). |
| D-63 | SPEC-06 GAP-13, accepted 2026-10-05: after an authorized payment whose follow-up failed, a same-key retry returns the same `502 authorized_completion_failed` and the provider is not called again. Pinned by a frozen scenario so a rebuild can't "improve" it into a second charge (accepted limitation, THREAT-03). |
| D-64 | SPEC-06 GAP-14, accepted 2026-10-05: Checkout treats Reservation's `409 already_completed` as success, because repeating an identical completion is harmless. Customer's `409 already_applied` on an account change is **not** treated as success: it can't prove the earlier change had the same amount, so it surfaces as a failure (THREAT-03 covers the stuck retry). Both are pinned by scenarios. |
| D-65 | SPEC-06 GAP-15, accepted 2026-10-05: a promotion amount must be at least 1 cent. A $0 or missing amount is `400 validation_error`, and nothing is stored or sent to Customer. A $0 promotion is almost always a mistake, and accepting it would silently use up the bill's only promotion. `PromotionRequest.amount` becomes required with `minimum: 1`. |
| D-66 | ENG-02 REV-016, decided 2026-10-05 (refines D-48): billing actions on a visit (promotion, cash recording, and the finalize-repeat check) follow the visit's **current** veterinarian, as Reservation records it. After a fill-in self-claim, the new veterinarian can bill the visit and the original one can't, unless the original is an administrator (D-41). Checkout asks Reservation each time rather than keeping a copy. Pinned by two workflow scenarios (frozen in `bafcbbe`). |

Full planning context and the gap analysis that led to D-39–D-44:
[`docs/design/mvp-02a-admin-roster.md`](../design/mvp-02a-admin-roster.md).

## Architectural implications

### SPEC-05 scope revision after TEST-01

The user reaffirmed two seeded veterinarians with independent offices,
assigned-veterinarian acceptance/denial/cancellation, customers canceling only
their own appointments before the start, multiple services per visit, and the
non-refundable booking fee. Because acceptance already requires that fee to be
paid, cancellation retains the payment; it does not charge the fee again.

Customer self-registration with at least one pet and a preferred veterinarian,
editing completed visits, and updating service types are requested November MVP
changes. The user subsequently confirmed that all customer information is required
at registration, including insurance, saved mock payment details, and secondary
contact. Multiple smaller payments may target a single visit using card payments
and veterinarian-recorded cash. Failed payments leave the balance unchanged;
any outstanding customer balance blocks new appointment requests. These accepted
changes require coordinated revisions of the older frozen schemas and tests under
SPEC-05. Pet removal and archival are deferred to DATA-01, a separate personal
learning demo covering governance, archival, retrieval, and reporting.
Catalog name/fee updates are now specified in the domain and fee-service contract.
Completed-visit corrections are limited to clinical notes, diagnoses, medications,
and follow-up notes by the assigned veterinarian. Recorded services, timestamps,
references, completion state, finalized bills, payments, and debt remain unchanged.

An administrator role, additional veterinarians, veterinarian departure policies,
and payments allocated across visits belong to a later MVP, possibly a 2027
workshop on evolving a tested product with AI. **Superseded 2026-10-04 (D-39–D-44):**
the administrator role and additional-veterinarians (roster growth beyond two)
moved up into MVP-02A — see BACKLOG.md. Veterinarian departure policies and
payments allocated across multiple visits remain deferred to MVP-02 per BACKLOG's
"Out of scope" list; only roster *growth* and admin oversight move now, not
departure/offboarding workflows beyond simple deactivation (D-43).

Do not add extra profile-completion, visit, bill-payment, or appointment-time UI
flows to the November demo. The user confirmed that the existing backend journeys
and TEST-02 tests remain in scope.

Latest domain decisions are authoritative in [SPEC-02](domain-model.md): stable IDs;
zero-pet customers; no walk-ins; one reservation to zero/one visit; nonempty requested
and performed service collections; estimated birth date replacing age; explicit
appointment and action timestamps; per-visit account entries; payment records; and
historical billed prices. Completion and financial standing must use one combined
canonical reservationState field with CompletedSettled and CompletedOutstanding.
These names supersede Completed with Payment and Completed with no payment.
Earlier single-Service
and age wording in this historical decision record is superseded by that model.

The latest Customer, Pet, and Visit field definitions and their draft scenarios
are captured in [SPEC-02 domain model](domain-model.md). Customer name is split
into firstName and lastName; Customer aggregates reservations and visits across
all their pets; each Visit references one Customer, Pet, Veterinarian, Reservation,
and a nonempty collection of performed services.

There are now four planned services: Customer, Reservation, VeterinarianServices,
and Checkout. The fee service is a small independent dependency, not a real payment
provider. Payment remains fake. All stores remain in memory.

The business sequence is now customer/profile → reservation request → acceptance
with $20 booking payment → documented visit → checkout for the remaining service
fee → completion outcome. A $0.00 checkout leaves the customer in good standing.
Zero due is CompletedSettled and requires no authorization. Booking authorization failure and sequencing
with capacity acceptance still need a defined outcome.

Customer owns outstanding balances; the veterinarian owns clinical records.
Reservation is assigned as the software owner of clinical Visit records, with the
veterinarian as their clinical owner. Customer histories read those shared records.

## Fee catalog

| Service | Booking fee | Service fee | Total |
| --- | --- | --- | --- |
| Wellness | $20 | $50 | $70 |
| Surgery | $20 | $2,000 | $2,020 |
| Sick | $20 | $75 | $95 |
| Vaccination | $20 | $100 | $120 |
| Spay or Neuter | $20 | $250 | $270 |

This is the latest user-specified catalog and supersedes the earlier names/prices.

Use integer cents in API amounts and currency `USD`. The booking fee is one
component of the total, not an additional charge after that total. It is paid at
acceptance and retained if cancelled. Checkout must account for that earlier payment
and must not collect the $20 twice. Wellness totals $70: $20 at acceptance
and $50 remaining at checkout. No live payment system is introduced.

## D-12 — Mock idempotency convention

These are agent-selected design defaults requested by the user, to include in the
specification review. They do not require real payment credentials or infrastructure.

- Client creates a UUID v4 per intentional payment attempt and sends it in the
  `Idempotency-Key` header. Retransmission/double-click reuses the same key.
- Scope is the checkout (shared by card and cash) plus key (D-62); retain request fingerprint and completed response
  for the lifetime of the in-memory demo session. Restart loses this state.
- The new booking payment needs a separate operation scope (reservation plus key),
  distinct from visit checkout, so its paid fee cannot be replayed as a service payment.
- Sequential or concurrent identical requests share one authorization and return
  the same completed response/status. Replays do not duplicate balance or completion
  updates. The fake provider also deduplicates its authorization by attempt key.
- Reusing a key with different business input returns HTTP 409 without authorizing
  again. Fingerprint the checkout, payment method, amount, and mock payment-method token; exclude
  tracing headers. Snapshot authoritative fees on the initial attempt so a replay
  does not silently reprice it. Exact request schema belongs in SPEC-02.
- A declined result is also replayed. To retry with a different method, create a
  new key. Never overwrite the recorded declined attempt to disguise a new attempt.
- Successful settlement prevents another authorization for that same settled visit
  even if a new key is sent. Implement this with visit settlement checks in addition
  to key deduplication. Manual-recovery outcomes are not automatic new attempts.
- Cash recording shares the card-payment key scope per checkout (D-62) and must not invoke the fake payment
  authorization. It must also avoid duplicate account credits on repeated submission.
- Retain opaque mock method tokens only; no real card details. Do not export keys,
  billing information, or payment-method tokens in telemetry.

## Follow-up decisions before executable specifications

1. **Completion settled:** Decline uses CompletedOutstanding; full authorized/cash
   payment or zero due uses CompletedSettled. Later full payment updates the combined
   state. Payment for one visit must not erase unrelated balances.
2. **Duplicate checkout:** Core behavior is approved and mock conventions are defined
   above. Review their concrete request/response schemas with SPEC-02.
3. **Schedule:** Settled by D-16, D-17, D-18, D-25.
4. **Ownership settled:** Reservation stores clinical records, Customer owns account
   entries, and Checkout owns bills/payment attempts. Define their API schemas next.
5. **Pricing:** The non-refundable $20 is paid at acceptance. Cash fallback after a
   failed payment is settled by D-19; booking-fee failure by D-23; a $0 remaining
   balance is possible through a promotion (D-26). Requested and performed services are now distinct,
   nonempty collections with unique service IDs and quantity one. Checkout snapshots
   performed-service prices at bill finalization; booking fee is frozen at acceptance.
6. **Profile:** Owner = Customer (D-21). Field shapes are in SPEC-02. Insurance is optional as stated. Use synthetic billing/profile data.
7. **Cancellation/migration:** Reservation cancellation and clinical-record preservation
   are now approved. Specify the replacement endpoint and compatibility behavior;
   A Saturday request is a valid expected-rejection scenario (D-22). Settled by D-24:
   the new application replaces the legacy baseline; no migration.
8. **Failures:** Specify unknown-entity and illegal-transition responses, manual
   recovery visibility, and the effect of completion failure on account balance.
   Do not report a successful completion or declined payment for an unknown result.

## SPEC-02 tasks unlocked by these decisions

- Customer/profile and eligibility features, including outstanding-balance rejection.
- Reservation features for workdays, lunch, hourly boundaries, two-vet capacity,
  approval contention, non-expiry, transitions, and cancellation cutoff.
- Cancellation scenarios must prove slot reuse, clinical-record preservation, and
  retention of the already-paid booking fee. Add booking-payment and checkout
  assertions proving that the $20 is paid once and credited toward the visit total.
- Visit documentation specification and its ownership decision.
- VeterinarianServices fee lookup contract and its own feature file.
- Checkout features for authorized positive amount, zero amount, decline, and
  manual-recovery visibility; sequential and concurrent duplicate submission must
  return the original result with exactly one authorization. Settle remaining key
  policies before defining their specific API assertions.
- Separate cross-service features for accepted reservation → visit → checkout.
- API and telemetry specifications derived from those reviewed business scenarios.

## SPEC-03 implications

Done in [observability.md](../observability.md): OBS-011 and OBS-013–OBS-019 are
retired and replaced by OBS-023–OBS-040 for the new design (request, accept/deny,
cancel, visit, fee lookup, bill, promotion, payment, cash, account, completion).
OBS-001 now includes the fee service; OBS-005 now covers insurance, contacts,
clinical content, and denial text. Legacy OBS-011 stays with tag `1.0` (D-24).

No business tests or implementation are added by this decision record. Specification
review remains open until the relevant follow-ups are answered.
