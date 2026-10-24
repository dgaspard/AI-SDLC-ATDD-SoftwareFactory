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

PetClinic’s `spec/run-all.js` is the thin compatibility adapter for `runLegacy`.
Consumer requirements, assertions, runtime bindings and evidence-v1 meanings stay
application-owned. See [BACKLOG START-02](../../BACKLOG.md) for integration evidence
and remaining consumer-CLI adoption work. This is not lifecycle tooling or repository
separation.

Verification commands (boundary cases require a clean committed factory snapshot):

```sh
node --test --test-concurrency=1 spec/tests/factory/consumer-boundary.test.js tools/factory/self-test.mjs
node --test tools/factory/legacy-runner.test.mjs
```

The additional tests use disposable synthetic consumers. The legacy regression driver
preserves the frozen CI-02 assertions with an isolated fixture using the extracted
runner. Neither driver replaces the protected application gate. Temporary local test
commits are not human-reviewed release pins. The external trust snapshot is the
caller's responsibility; local hashes do not isolate hostile code or certify evidence.
