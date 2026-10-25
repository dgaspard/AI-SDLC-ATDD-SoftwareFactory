// Self-check for the Claude Code protect-paths hook (.claude/hooks). Protected test.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function decision(tool, toolInput) {
  const r = spawnSync("node", [path.join(REPO_ROOT, ".claude/hooks/protect-paths.mjs")], {
    input: JSON.stringify({ tool_name: tool, tool_input: toolInput }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
}

const denied = [
  ["Edit", { file_path: path.join(REPO_ROOT, "spec/features/customer/pets.feature") }],
  ["Write", { file_path: "spec/tests/new.test.js" }],
  ["Edit", { file_path: "docs/specs/domain-model.md" }],
  ["Edit", { file_path: "AGENTS.md" }],
  ["Edit", { file_path: ".claude/settings.json" }],
  ["Edit", { file_path: ".github/workflows/guard.yml" }],
  ["Write", { file_path: ".github/CODEOWNERS" }],
  ["Bash", { command: "echo x > .github/workflows/guard.yml" }],
  ["Bash", { command: "rm .github/CODEOWNERS" }],
  ["Bash", { command: "rm -rf spec/tests" }],
  ["Bash", { command: "sed -i s/a/b/ spec/features/customer/pets.feature" }],
  ["Bash", { command: "echo x > spec/tests/a.test.js" }],
  ["Bash", { command: "git checkout -- spec/" }],
  ["Bash", { command: "npm --prefix spec run guard:freeze" }],
  ["Bash", { command: "node -e \"import('./tools/guard/freeze.mjs').then(m => m.freeze(process.cwd()))\"" }],
  ["Edit", { file_path: "tools/guard/guard.mjs" }],
  ["Bash", { command: "echo x > tools/guard/check.mjs" }],
];
const allowed = [
  ["Write", { file_path: "services/checkout/server.js" }],
  ["Edit", { file_path: "frontend/index.html" }],
  ["Edit", { file_path: ".github/workflows/delivery-nonprod.yml" }],
  ["Write", { file_path: ".github/workflows/delivery-prod.yml" }],
  ["Bash", { command: "echo x > .github/workflows/delivery-prod.yml" }],
  ["Bash", { command: "rm .github/workflows/delivery-nonprod.yml" }],
  ["Bash", { command: "cat spec/features/customer/pets.feature 2>&1" }],
  ["Bash", { command: "npm test" }],
  ["Bash", { command: "npm --prefix spec test > /tmp/out.txt" }],
  ["Bash", { command: "mkdir -p services/checkout && echo hi > services/checkout/start" }],
];

describe("protect-paths hook", () => {
  it("[GUARD] Claude Edit deny rules match the shared protection boundary", () => {
    const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "spec/guard/protected-paths.json"), "utf8"));
    const settings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".claude/settings.json"), "utf8"));
    const expected = config.protected.map((p) => `Edit(./${p.endsWith("/") ? `${p}**` : p})`);
    assert.deepEqual(settings.permissions.deny, expected);
  });
  for (const [tool, input] of denied) {
    it(`[GUARD] denies ${tool} ${input.file_path ?? input.command} with an explanation`, () => {
      const d = decision(tool, input);
      assert.equal(d?.permissionDecision, "deny");
      assert.match(d.permissionDecisionReason, /GUARD-01/);
    });
  }
  for (const [tool, input] of allowed) {
    it(`[GUARD] allows ${tool} ${input.file_path ?? input.command}`, () => assert.equal(decision(tool, input), null));
  }
});
