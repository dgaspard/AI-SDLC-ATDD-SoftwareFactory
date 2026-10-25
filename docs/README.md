# Factory documentation map

- Direction and roadmap: [PROJECT-PLAN.md](../PROJECT-PLAN.md).
- Canonical milestone status: [BACKLOG.md](../BACKLOG.md), with completed history under `docs/history/`.
- Architecture decisions: [architecture.md](decisions/architecture.md); preserve superseded decisions as history.
- Current designs: `docs/design/`, including [START-02](design/start-02-factory-core.md).
- Developer instructions: [development-workflow.md](development-workflow.md).
- Consumer interface: [frozen contract](../spec/factory/consumer-contract.v1.md).
- Portable mechanisms: [factory CLI](../tools/factory/README.md).

PetClinic domain specifications, OBS coverage, application requirements and generated
delivery guidance belong in the [consumer documentation](https://github.com/dgaspard/ai-sdlc-petclinic/tree/8c16963fcb9392907ebb14a62aa1537eca12bc43/docs/README.md).
Historical review/reconstruction records retained here describe the tree evaluated at
the time, not the current consumer or a production capability.

Every code review includes a documentation pass in a fresh session: verify linked
paths, ownership, exact evidence revisions, stable IDs, and that proposed/future
capabilities are not described as implemented. Status belongs only in BACKLOG.md.
Add to canonical homes rather than creating dated recaps or scratch plans.

## Current design notes

See `docs/design/` and the canonical item in BACKLOG.md.

## The docs pass after every feature commit

Use the fresh-session documentation review described above.
