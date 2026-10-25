# Software Factory

Reusable verification, orchestration, guard and evidence mechanisms. PetClinic is
maintained in [its consumer repository](https://github.com/dgaspard/ai-sdlc-petclinic).
Historical shared commits and tags are preserved; application code is not maintained here.

## Consume an immutable revision

Fetch a reviewed full Git commit into an external dependency directory, check out
that exact commit detached, verify a clean tree, and install its locked dependencies
with `npm --prefix spec ci`. Never use a floating branch, mutable tag, symlink or
sibling source checkout as the consumer integration.

Consumers own application code, requirements, tests, workloads, policy and human trust.
See [the interface](spec/factory/consumer-contract.v1.md) and
[CLI instructions](tools/factory/README.md). Invoke `node /absolute/factory/tools/factory/consumer.mjs verify`
with explicit root, configuration and externally reviewed trust arguments.
The separate envelope records both identities; evidence-v1 meanings remain unchanged.

## Verify factory mechanisms

Use Node 22 or 24, `npm --prefix spec ci`, then `npm test` and `npm run test:verify`.
The factory tier checks neutral boundary fixtures, runner, guard, evidence, DORA and
App tooling. PetClinic's fourteen application suites run in its own repository.
Existing CI check names are retained for protection compatibility: `Application suite`
now verifies factory mechanisms, and `Delivery spec` checks reusable evidence contracts.
The locked dependency set remains conservative pending a separate dependency cleanup.

Humans review and freeze protected inputs; agents never run freeze. Current milestone
status is in [BACKLOG.md](BACKLOG.md). Lifecycle execution, cloud delivery and a second
consumer remain later work. No independent approval or automatic merge is implied.
