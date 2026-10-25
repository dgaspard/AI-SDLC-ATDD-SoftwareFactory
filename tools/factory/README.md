# Local factory mechanisms

`consumer.mjs verify --root <consumer> --config factory.config.json --trust <trusted-policy> --mode full`
implements the frozen `spec/factory/consumer-contract.v1.md` boundary. Invoke with
Node from a clean factory checkout pinned to its full Git SHA. No registry or implicit
fetch/install is used. Consumer paths, runtime bindings, tests and requirements come
from the reviewed consumer configuration and external trusted policy.

- `core.mjs`: closed configuration validation, path containment, frozen-input checking,
  Git identity and consumer tree hashing.
- `processes.mjs`: argv-based launch, grouped startup, health/test facilities and owned
  process-group cleanup. It never frees ports owned by unrelated processes.
- `consumer.mjs`: required suite execution and separate consumer-evidence.v1 output.
  Fast mode conservatively runs required suites but reports INCOMPLETE. No cache reuse.
- `index.mjs` / `legacy-runner.mjs`: compatibility runner extracted from the existing
  protected runner. All application paths, service IDs and tree environment variable
  are explicit arguments. Existing evidence-v1 semantics remain distinct.

The separate PetClinic consumer’s `spec/run-all.js` is the thin compatibility adapter for `runLegacy`.
Consumer requirements, assertions, runtime bindings and evidence-v1 meanings stay
application-owned. See [BACKLOG START-02](../../BACKLOG.md) for integration evidence,
independent consumer proof and remaining separation milestones. Lifecycle delivery
is not implemented. Evidence-v1 retains spec/run-all.js, protected manifest and feature-directory
conventions; these are compatibility constraints, not application imports.

Verification commands (boundary cases require a clean committed factory snapshot):

```sh
node --test --test-concurrency=1 spec/tests/factory/consumer-boundary.test.js tools/factory/self-test.mjs
node --test tools/factory/legacy-runner.test.mjs
```

The additional tests use disposable synthetic consumers. The legacy regression driver
preserves the frozen CI-02 assertions with an isolated fixture using the extracted
runner. Neither driver replaces a consumer-owned application gate. Temporary local test
commits are not human-reviewed release pins. The external trust snapshot is the
caller's responsibility; local hashes do not isolate hostile code or certify evidence.

## Governed local changes

The frozen interface is [governed-change.v1](../../spec/factory/governed-change.v1.md).
From a clean, committed factory checkout:

```sh
node tools/factory/change.mjs run --root /absolute/consumer --task spec/change.json --authority /external/authority.json --runner /external/runner.json --output /external/new-run
node tools/factory/change.mjs check --evidence /external/new-run/governed-change-evidence.v1.json
node --test tools/factory/change.test.mjs
```

The additional regression tests also run through `self-test.mjs` in the required
boundary suite.

The authority binds the reviewed starting consumer commit, task digest, factory pin,
consumer trust and runner descriptor. Paths are resolved before output approval.
The coordinator retains private candidate and verification clones, a journal,
process logs, a reviewable diff and separate governed-change evidence. Explicit
create/update/delete grants permit only named application files. Protected inputs,
original checkout and Git metadata are checked independently. Ignored files also
participate in permission enforcement and stale-evidence checking; only declared
verifier output roots are excluded from verifier input comparison.

Only explicitly declared fixture launchers run. Their success is
`SIMULATED_VERIFIED` (exit 0), never a real application-change demonstration.
Otherwise-valid real launcher requests fail before execution with `TOOLING_UNAVAILABLE`
(exit 5): an OS-enforced launcher, credential broker and independent verification
profile still require implementation and qualification. Fixture processes run with
an allowlisted environment and process-group cleanup, but are trusted test code,
not a security sandbox. Post-execution checks cannot prevent a hostile fixture
from writing outside its workspace. Do not use fixture mode for application work.

Failures after output creation retain their run directories and report a nonzero
contract exit status; preflight failures create no run directory. SIGINT/SIGTERM
report 130 after successful cleanup; cleanup failure overrides that with exit 9. Metadata-tampering failures retain a JSON
filesystem change list without executing Git against the compromised metadata.
`check` rejects nonterminal runs and stale inputs/artifacts. Nothing automatically
resumes, commits, merges, publishes or deletes a retained run. Host-loss process
recovery is not qualified: process IDs are journaled after launch, leaving a crash
window. Human inspection and explicit cleanup remain necessary after host loss.
PetClinic implementation and any consumer pin upgrade remain separate work.
