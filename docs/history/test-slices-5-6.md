# TEST-01 slices 5 and 6 review

Phase: specification. These tests add requirements checks, not service implementations.
Latest verification: the [2026-09-27 green/mutation rehearsal](test-slices-5-6-rehearsal.md)
passed all 310 slice checks and detected 13 deliberate defects without changing
protected files. Temporary implementations were removed afterward.
Recent commits reviewed: `aba9d82` (Reservation steps), `a6f2cd2` (freeze), and
`1cfea69` (Checkout steps). Existing steps and features are unchanged.

## Slice 5: access control

[access-control.test.js](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/spec/tests/auth/access-control.test.js) enumerates all
34 protected operations from the four OpenAPI documents and their `x-roles`.
It checks missing, malformed, bad-signature, unsigned (`alg: none`), and expired
tokens; every excluded known role; and ownership where applicable. Anonymous
login remains in the existing login suite. An operation allowing all three roles
has no wrong-role case; inventing an invalid JWT role would test authentication instead.

Ownership fixtures create real reservations, visits, and checkouts through public
APIs. A successful owner read proves the protected target exists before another
customer requests it. Mutation attempts also verify the original record is unchanged.
Lists must filter records by ownership; unlike individual records they return an
empty list, not 404. Catalog/calendar operations have no customer-owned record.
A classification assertion fails when a new customer-accessible operation is not
assigned an ownership, collection, or public-catalog test policy.

Shared support: [access-cases.js](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/spec/tests/support/access-cases.js) and
[service-fixture.js](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/spec/tests/support/service-fixture.js). Every request body
and documented response is schema checked. Dependencies are contract-checked stubs.

## Slice 6: telemetry

[business-traces.test.js](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/spec/tests/observability/business-traces.test.js)
exercises a real service with dependency stubs and the real payment fake.
[business-workflows.test.js](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/spec/tests/observability/business-workflows.test.js)
exercises all four real services for OBS-036–040, because stubs cannot prove
cross-process business spans. It adds no workflow feature files.

Each measured request supplies a fresh W3C context so setup traces cannot satisfy
the assertion. Checks include span names, outcomes, statuses, known entity IDs,
integer amounts/boolean replay flags, exactly one operation span, ended spans,
and the request SERVER parent. Payment authorization is a CLIENT span. Export
polling waits for required spans and their ancestry, not fixed generated IDs or durations.

OBS-002 inspects actual `traceparent` headers recorded by Customer, Checkout,
Reservation, and VeterinarianServices stubs, relates their parent IDs to exported
HTTP CLIENT spans, and checks service-token signatures and roles. Concurrent
reservation requests use different pets and trace IDs to detect context mixing.
Real-service evidence also checks customer balance, reservation state, slot
availability, and provider call counts. Retries cover success and decline,
sequentially and concurrently. Promotion checks entered versus applied amounts.

### Outcomes exercised

| Rule | Outcomes with runtime tests |
| --- | --- |
| OBS-023 | requested, denied_outstanding_balance, invalid_slot, past_start, pet_conflict, not_found |
| OBS-024 | accepted, past_start, booking_payment_declined, slot_unavailable, pet_conflict, not_assigned_veterinarian, invalid_state, not_found, failed |
| OBS-025 | denied, not_assigned_veterinarian, invalid_state, not_found |
| OBS-026 | canceled, already_started, not_assigned_veterinarian, invalid_state, not_found |
| OBS-027 | recorded, already_recorded, not_assigned_veterinarian, invalid_state, unknown_service, not_found |
| OBS-028 | found, unknown_service |
| OBS-029 | finalized, already_finalized, not_assigned_veterinarian, unknown_service, invalid_state, not_found, failed |
| OBS-030 | applied, already_applied, nothing_owed, not_found |
| OBS-031 | settled, declined, already_settled, invalid_amount, idempotency_conflict, authorized_completion_failed, not_found, failed |
| OBS-032 | authorized, declined, failed; booking_fee and visit_balance |
| OBS-033 | recorded (booking_fee and visit_balance), recorded replay, already_settled, invalid_amount, idempotency_conflict, not_found |
| OBS-034 | applied, already_applied for charge/credit/discount; invalid_amount for credit/discount; not_found |
| OBS-035 | completed_settled, completed_outstanding, already_completed, invalid_state, not_found |

`failed` is not exhaustively injectable through public APIs for every in-memory
operation. Covered injections are failed booking collection, disconnected fee
service, fake provider failure, and authorization followed by failed completion.
Internal storage faults need a deliberately specified fault boundary before tests
can drive them; do not add implementation-specific backdoors just for coverage.

## Contract gap decisions (2026-09-26)

User-directed specification revision after checkpoint `test-01-s5-s6`.
These decisions replace the open questions from the initial review.

| Decision | Resolved contract |
| --- | --- |
| GAP-01: missing 403 | `updateCustomer`, `addPet`, and `getAvailability` now document the shared Forbidden response. Access tests validate their actual operation schemas; no fallback remains. A harness check requires 403 for every operation excluding a known role. |
| GAP-02: telemetry outcomes | Add `past_start` to OBS-024, `not_assigned_veterinarian` to OBS-026 and OBS-027, and `invalid_amount` to OBS-031. These expected rejections use UNSET. |
| GAP-03: unknown performed service | Visit recording rejects a performed-service ID absent from the seeded catalog with 422 `unknown_service`, stores no visit, and emits OBS-027 `unknown_service` / UNSET. Reservation uses its seed data; no additional runtime dependency. |
| GAP-04: first bill finalization | The linked reservation must be Accepted and reference the visit being billed. Otherwise 409 `invalid_state`, OBS-029 `invalid_state` / UNSET, and no checkout or account change. If a checkout already exists, `already_finalized` takes precedence. |
| GAP-05: cash replay | Same key and identical input returns the original attempt/result with `replayed=true`; OBS-033 remains `recorded` / OK. No extra credit, completion, or provider call. Changed input under the key returns 409 `idempotency_conflict` before balance checks. A new visit-payment key against zero balance returns 409 `already_settled`; an unequal positive amount returns 422 `invalid_amount`. Rejections use UNSET and create no attempt. OBS-033 uses those outcomes instead of `already_recorded` / `nothing_owed`. Existing booking-fee deduplication continues to return the original paid result even with a new key. |
| GAP-06: authorized write failure | OBS-031 uses ERROR, outcome `authorized_completion_failed`, and `error.type=authorized_completion_failed`. The API remains 502 with manual recovery. OBS-032 still records successful authorization. This is the explicit exception to OBS-004's general `failed` outcome. |
| GAP-07: veterinarian identity | For veterinarian actions, `petclinic.veterinarian.id` is the acting veterinarian, including assignment rejection. For reservation requests it is the requested veterinarian. Unknown IDs are not invented. |

Cash recording now explicitly carries the boolean `petclinic.checkout.replayed`.
The operation registry, observability table, OpenAPI descriptions, BDD examples,
and assertion tests reflect these decisions. Protected files need another human
review/freeze. Privacy/exporter lifecycle/general storage-fault tests remain
outside these slices; those coverage gaps are not unresolved business decisions.

## Verification and handoff

Run `npm test`. All suites run even if the guard fails. The runtime suite and new
application assertions are intentionally red until the services exist.

Last verification after GAP-01–07 (2026-09-26): `npm test` with local port access; 45 harness
checks and 131 schema checks passed. Runtime: 12 passed / 40 failed.
Authentication: 1 passed / 227 failed (includes 218 slice-5 tests: one classification
check and 217 runtime cases). Observability: 104 failed (92 slice-6 runtime cases).
All 166 BDD scenarios remain red, including five new examples from this revision.
The BDD dry run resolves every step without undefined or ambiguous steps.
New runtime failures report missing
service `start` scripts, with no new import/syntax/fixture failures observed.
The guard correctly reports unfrozen protected additions. `git diff --check` passes.

[assertion-slices.test.js](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/spec/tests/harness/assertion-slices.test.js) validates
request fixtures, programmed dependency responses, and alignment of the span/outcome
registry with the observability document. Synthetic positive controls and deliberate
mutations verify detection of missing/duplicate spans, wrong outcomes/statuses/replay
flags, unended spans, wrong parents, missing headers, mixed contexts, and wrong HTTP
destinations. These are harness checks, not proof that the application passes.

The initial handoff lacked a green rehearsal. That gap is now closed by the
[2026-09-27 rehearsal](test-slices-5-6-rehearsal.md): all runtime arrangement paths and
assertions in the three slice suites passed against temporary services, including
real cross-process workflows. Thirteen deliberate defects failed their targeted
checks, and all targets passed again after restoration. This does not close the
broader observability coverage gaps described above.

Checkpoint `test-01-s5-s6`: the supplied protected manifest now includes these
additions and the preceding Checkout slice; `guard:check` passes. The assistant
did not regenerate the manifest. Per [AGENTS.md](../../AGENTS.md), “Only a human runs
`npm --prefix spec run guard:freeze`, after reviewing a spec change.” Future
contract/test revisions require another human freeze.
