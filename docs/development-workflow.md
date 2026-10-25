# Factory development workflow

Read AGENTS.md, the canonical BACKLOG item, design, architecture decisions and affected
frozen contracts before work. Status belongs only in BACKLOG.md. The factory owns
reusable orchestration, verification and evidence; consumers own application code,
requirements, policies, fixtures and workloads.

Humans review specifications and freeze them. Agents may draft exact protected changes
when authorized, but never refresh the manifest. Build only against approved frozen
requirements. Do not weaken assertions to pass tests. Preserve stable requirement IDs.

Use `npm run test:fast` during development, `npm run test:gate` before completion and
`npm run test:verify` on the final tree. Factory suites use neutral fixtures. Independent
consumer verification uses the reviewed immutable factory revision and external trust.
Report run records, exact tree, failures and any missing tooling; local proof does not
replace CI. Require independent engineering review and a fresh documentation pass.

Record persistent handoffs in the canonical backlog/design rather than dated scratch
documents. Preserve historical evidence; distinguish requirements, proposals and verified
capabilities. No lifecycle, cloud, automatic approval or merge is implied by extraction.

PetClinic service layout, domain-schema workflow, accepted risks and application review
instructions are maintained in the [consumer workflow](https://github.com/dgaspard/ai-sdlc-petclinic/tree/8c16963fcb9392907ebb14a62aa1537eca12bc43/docs/development-workflow.md).
The [pre-separation factory workflow](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/docs/development-workflow.md)
retains the historical reconstruction protocol and examples.
