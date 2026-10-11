# Threat model

Single-purpose record of known, accepted architectural risks — not a log of
findings or activity. Other records (business decisions, contracts,
engineering reviews) reference an entry here by ID (`THREAT-01`, ...) rather
than restating it. Keep each entry short enough to scan; elaboration belongs
in whichever decision record or contract the risk originated from, linked
from the entry below.

| ID | Risk | Status |
| --- | --- | --- |
| THREAT-01 | All services share one `AUTH_TOKEN_SECRET` (HS256). Any one compromised service can forge a valid token for any user or role — there is no per-service key separation. | Disclosed demo limitation, not mitigated. Deliberate shortcut for a local, no-cloud-dependency demo (A-09); never a production pattern. See `spec/contracts/auth-contract.md`. |
| THREAT-02 | The dual-role (administrator + veterinarian) account carries both roles in a single JWT. A stolen token for this one account grants both privilege levels at once, a larger blast radius than any single-role account's token. | Disclosed, accepted, not engineered around — consistent with THREAT-01's existing posture. See `docs/specs/business-decisions.md` D-44. |
| THREAT-03 | A partially failed money operation is reported honestly but **can't be finished by a retry**. Cases: an authorized card payment whose Customer credit failed (a same-key retry replays `authorized_completion_failed`, and a new key charges again); a $0 promotion whose `complete()` failed (stranded at Accepted); a finalize whose Customer write failed (the `incompleteBills` guard blocks a second charge, but the bill can never be created). Exploiting it needs a dependency failure at the wrong moment, not an attacker. | Disclosed, accepted (2026-10-05). PROJECT-PLAN excludes automated recovery provided the outcome is honest and observable, which it is (`authorized_completion_failed`, `dependency_failed`). Manual reconciliation is assumed. Found by ENG-02 (`docs/engineering-reviews/eng-02-calibration-2026-10-05.md`, REV-007/009/010). |
| THREAT-04 | Route path params are URL-decoded and then interpolated into downstream URLs that carry a **service** token, so an encoded `/` or `?` in an ID can re-target the downstream call (shown 2026-10-05: Checkout `POST /visits/{visitId}/checkout` made to `GET` arbitrary Reservation paths as `service`). | **Mitigated in the JS runtime** (`services/platform/runtime.js`, `305c121`): path params are validated against their contract schema (`format: uuid`), and failures return 404. **Not protected by a frozen test**, so a rebuild in another language (e.g. the live Python Checkout) can reintroduce it. Candidate spec addition: a non-UUID path ID returns 404 with no downstream call. |
| THREAT-05 | Demo passwords are stored in plain text and compared with `===` in `/auth/login` (not constant-time). | Disclosed demo limitation (A-09: "plain-text demo passwords, clearly non-production"). The hardened `timing-unsafe-secret-compare-js` Semgrep rule flags it. Expected, not a regression. |

## Adding an entry

A new entry needs: the concrete mechanism that creates the risk (not a vague
category), what it would take to exploit, and whether it's disclosed-and-
accepted or needs a mitigation tracked elsewhere. If a mitigation lands,
update the Status column rather than deleting the row — the history of what
was once true matters as much as what's true now.
