# Delivery spec (SPEC-08)

**Frozen 2026-10-10.** Scenarios whose delivery code isn't built yet carry `@awaiting:<backlog ID>`.
They run as information only, and everything else is required.
Design and rationale: [docs/design/spec-08-delivery.md](../../docs/design/spec-08-delivery.md).

What has to be true of the images, workflows, cloud templates and environments that
deliver this system. Agents build the delivery code (Dockerfiles, `compose.yaml`,
`infra/`, `.github/workflows/delivery-*.yml`) until this suite passes. Humans own this
suite and the root of trust that runs it (`root-of-trust.json`).

Humans: start with the generated guide [docs/delivery/environments.md](../../docs/delivery/environments.md),
which lists what runs in Local, Non-prod and Prod.

## Run it

```bash
npm ci                 # own package; no imports from spec/harness (portable)
npm test               # required: static + template tiers, minus @awaiting; offline
npm run test:static    # Dockerfiles, compose.yaml, workflows, catalog (fast loop)
npm run test:template  # runs infra/synth, checks CloudFormation + cfn-guard policies
npm run test:live      # required live checks (GitHub settings, deployed env); CI only
npm run test:awaiting  # information only: progress per backlog item; flags awaiting controls that already pass
npm run catalog:render # after editing catalog.yaml
npm run policy:test    # cfn-guard unit tests for policy/*.guard
```

Prerequisites: Node 22+, and for the template tier [AWS CloudFormation Guard](https://github.com/aws-cloudformation/cloudformation-guard) 3.x (`cfn-guard`) on `PATH`.
A missing tool fails with `tooling: …`, never as a product failure.

## Layout

| Path | What |
| --- | --- |
| `contract.md` | DC-001..DC-008: the only names and entry points the features rely on |
| `catalog.yaml` | Every practice, tool and AWS service, and its use in each environment |
| `features/` | One scenario per control (`@CTL-NNN`) |
| `policy/` | cfn-guard rules called by the template tier, with unit tests in `policy/tests/` |
| `steps/` | Step definitions; `steps/support/` reads the repository and templates |
| `tools/` | Catalog loader and renderer |
| `contracts/` | AI provenance predicate schema (DC-007) |

## Tags

Each control scenario has exactly one `@CTL-NNN` and one `@tier:`, plus at least one
of each of the others. The catalog checks (`features/catalog/`) enforce this.

| Tag | Values | Meaning |
| --- | --- | --- |
| `@CTL-NNN` | `CTL-001`… | Stable control ID. Never renumbered or reused (SPEC-03 rules) |
| `@tier:` | `static`, `template`, `live` | Where it can run: static and template run offline in the agent's loop; live needs AWS and runs in CI (A-13) |
| `@env:` | `local`, `nonprod`, `prod` | Environments the control protects |
| `@pillar:` | `security`, `observability`, `governance`, `telemetry`, `performance`, `compliance`, `cost` | Grouping for the catalog |
| `@nist:` | NIST SP 800-53 Rev 5 control, e.g. `AC-6` | Compliance mapping (A-16); `none` when not a security control |
| `@ssdf:` | NIST SP 800-218 practice, e.g. `PW.4.1` | Secure development mapping (A-16); `none` likewise |
| `@meta` | | Checks about the spec itself; no CTL |
| `@awaiting:` | a backlog ID, e.g. `ENV-01` | The delivery code is built in that item. Information only until a human removes the tag at a freeze; removing it is what makes the control required. At most one per scenario, and it must name a `### <ID> —` heading in `BACKLOG.md`. (`@pending` is not used because the SPEC-07 guard treats it as a skip.) |

## Finishing a backlog item

1. The agent builds the delivery code until `npm run test:awaiting` shows the item's
   scenarios passing (`STATE CHANGE … passes`). Agents never add or remove `@awaiting` tags.
2. A human removes that item's `@awaiting:` tags, re-renders the catalog and runs
   `guard:freeze`. The controls are now required in `npm test` and in the `Delivery spec`
   check, and from then on they can't regress.

## Adding a control

1. Add or extend a catalog entry: what it is, and its use and reason in each environment.
2. Add one scenario with the next free `CTL-NNN` and the full tag set. Add
   `@awaiting:<ID>` if the delivery code belongs to a backlog item not yet built.
3. Run `npm run catalog:render`, then `npm test`. The new scenario must fail for the
   right reason (the missing thing), not because of an undefined step.
4. Plant the defect it guards against in a scratch copy and confirm it is caught
   (see the calibration table in the design doc).
