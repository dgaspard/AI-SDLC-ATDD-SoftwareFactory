import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./agent.mjs', import.meta.url));
// Refusals must occur before credential loading/network access. No real credentials
// are supplied to these subprocesses, and no authenticated operation is requested.
for (const args of [
  ['--repository'],
  ['--repository', 'someone/else', 'check'],
  ['--repository', 'dgaspard/ai-sdlc-petclinic/extra', 'check'],
  ['--repository', 'dgaspard/ai-sdlc-petclinic', 'unknown'],
]) {
  test(`invalid target/command: ${args.join(' ')}`, () => {
    const r = spawnSync(process.execPath, [script, ...args], {encoding:'utf8', env:{}});
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Refused: repository|Usage:/);
    assert.doesNotMatch(r.stderr, /GitHub GET|ENOENT|configuration/);
  });
}
for (const repository of ['dgaspard/AI-SDLC-ATDD-SoftwareFactory', 'dgaspard/ai-sdlc-petclinic']) {
  test(`merge remains refused for ${repository}`, () => {
    const r = spawnSync(process.execPath, [script, '--repository', repository, 'gh', 'pr', 'merge', '1'], {encoding:'utf8', env:{}});
    assert.equal(r.status, 3);
    assert.match(r.stderr, /agents never approve, merge or bypass/);
  });
}
