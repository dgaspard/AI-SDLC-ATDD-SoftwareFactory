# PetClinic consumer bindings

These are consumer-owned adapters, not reusable factory defaults. Canonical status
and review prerequisites are in [START-02](../../BACKLOG.md). The protected adoption
configuration lives at `spec/factory/petclinic/config.json` after human application
of the reviewed patch. Its seven projects match `spec/harness/config.js` exactly.

The explicit adoption entry point is:

```sh
node tools/petclinic/verify.mjs --root /absolute/consumer-checkout \
  --factory /absolute/clean-pinned-factory --trust /absolute/trusted-policy.json
```

The factory checkout must be outside the consumer, clean, and at the full revision
in the reviewed configuration. No fetching, installation, implicit setup, pin
updates, guard freeze or repository creation occurs. The ordinary npm entry points
retain the legacy runner and v1 evidence contract. During adoption verification the
reviewed runner adapter uses `FACTORY_CHECKOUT` supplied by the executing CLI.

The protected adoption policy chooses suite-owned runtime. The CLI starts all seven
projects in their three declared groups, checks health/reset/clock, and stops only
its own processes before the existing suites execute sequentially. Runtime tests
still exercise disabled facilities and alternate ports; performance tests retain
their existing workload, timing, workers, thresholds and host assumptions. Nothing
changes `spec/harness/processes.js` or application assertions.

Each suite executes through `suite.mjs` without cache. Receipts bind the original
v1 run records to the current factory invocation. The final suite verifies that
every required passing record belongs to that invocation, generates and verifies
an unchanged change-evidence.v1 report, and writes a separate hash binding. The
factory checks those hashes after cleanup and includes the original artifacts in
consumer-evidence.v1. It does not reinterpret v1 claims as two-repository proof.

## Human-owned trust

The protected `authority.json` declares required suites and artifacts. The config,
policy, adapter and authority source must be included in the human-frozen manifest
before adoption. The generated
external trust snapshot contains the hashes of config/manifest bytes at one explicit
human-reviewed commit. Keeping that generated snapshot outside its own source
manifest avoids a circular hash dependency.

After the owner applies/reviews the patch, freezes it and commits the reviewed
consumer tree, use that exact local commit (not an inferred HEAD):

```sh
node tools/petclinic/trust-snapshot.mjs --root /absolute/consumer-checkout \
  --reviewed-revision FULL_40_HEX_APPROVED_COMMIT \
  --output /absolute/external-directory/petclinic-trusted-policy.json
```

The command refuses an existing output or output inside the consumer. It reads Git
objects, never updates the manifest, and does not decide that a commit is approved.
Read-only file mode prevents accidental writes, not hostile execution; independent
CI isolation remains separate work. The CLI verifies current protected bytes against
this authority before launching anything.

Local factory candidate snapshots and their bundle are review artifacts, not
released versions or proof that PetClinic has a separate repository. Preserve the
candidate commit referenced in the patch; changing the factory pin/config requires
another reviewed freeze. Before running the full consumer gate, tooling must already
exist, including the pinned browser image and populated matching lockfile volumes;
verification is not authorization for installation or remote access.
