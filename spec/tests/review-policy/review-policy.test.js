// REVIEW-02: the review-policy evaluator decides, from review facts and the protected review
// policy and root of trust, whether the approver identity may approve one pull request at one
// head commit, and writes a decision record. The evaluator (tools/review-policy/evaluate.mjs)
// is agent-built; these tests, the contracts and the fixture are protected. Protected test.
//
// Interface:
//   node tools/review-policy/evaluate.mjs --facts <file> --now <date-time> --out <file>
//        [--policy <file>] [--root-of-trust <file>]
// --policy and --root-of-trust default to spec/delivery/review-policy.json and
// spec/delivery/root-of-trust.json. Exit 0 when a decision record is written (approve or
// refer-to-human), and the first stdout line is the decision. Any other exit code means the
// input was rejected and no record was written.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const SPEC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(SPEC, "..");
const TOOL = path.join(ROOT, "tools/review-policy/evaluate.mjs");
const POLICY = path.join(SPEC, "delivery/review-policy.json");
const ROOT_OF_TRUST = path.join(SPEC, "delivery/root-of-trust.json");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(SPEC, "tests/review-policy/fixtures/eligible.json"), "utf8"));
const schema = (f) => JSON.parse(fs.readFileSync(path.join(SPEC, "delivery/contracts", f), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addFormat("date-time", (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)));
const validFacts = ajv.compile(schema("review-facts.v1.schema.json"));
const validDecision = ajv.compile(schema("review-decision.v1.schema.json"));
const NOW = "2026-10-16T12:05:00Z";
const HEAD = FIXTURE.pullRequest.headSha;
const OLD = "2222222222222222222222222222222222222222";
const REQUIRED = JSON.parse(fs.readFileSync(ROOT_OF_TRUST, "utf8")).requiredChecks;

let dir;
const facts = (mutate = () => {}) => {
  const f = structuredClone(FIXTURE);
  mutate(f);
  return f;
};
/** Runs the evaluator and returns { code, out, written, record, bytes }. */
function evaluate(input, extra = []) {
  const factsFile = path.join(dir, "facts.json");
  const out = path.join(dir, "decision.json");
  fs.rmSync(out, { force: true });
  fs.writeFileSync(factsFile, JSON.stringify(input, null, 2));
  const r = spawnSync(process.execPath, [TOOL, "--facts", factsFile, "--now", NOW, "--out", out, ...extra], { cwd: dir, encoding: "utf8" });
  const written = fs.existsSync(out);
  const bytes = written ? fs.readFileSync(out) : null;
  return { code: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout, written, bytes, record: written ? JSON.parse(bytes.toString("utf8")) : null };
}
const decided = (input, extra) => {
  const r = evaluate(input, extra);
  assert.equal(r.code, 0, r.out);
  assert.ok(r.written, "no decision record was written");
  assert.ok(validDecision(r.record), JSON.stringify(validDecision.errors, null, 2));
  assert.equal(r.stdout.split("\n")[0].trim(), r.record.decision, "first stdout line is not the decision");
  return r.record;
};
const approved = (input, extra) => {
  const d = decided(input, extra);
  assert.equal(d.decision, "approve", JSON.stringify(d.reasons));
  assert.equal(d.eligible, true);
  assert.deepEqual(d.reasons, []);
  return d;
};
const referred = (input, code, extra) => {
  const d = decided(input, extra);
  assert.equal(d.decision, "refer-to-human");
  assert.equal(d.eligible, false);
  assert.ok(d.reasons.some((r) => r.code === code), `expected reason ${code}, got ${JSON.stringify(d.reasons)}`);
  return d;
};
const rejected = (input, why, extra) => {
  const r = evaluate(input, extra);
  assert.notEqual(r.code, 0, `${why} was accepted`);
  assert.equal(r.written, false, `${why} still wrote a decision record`);
};
const run = (name, conclusion, over = {}) => ({ name, headSha: HEAD, status: "completed", conclusion, completedAt: "2026-10-16T11:59:00Z", ...over });
const withRootOfTrust = (mutate) => {
  const rot = JSON.parse(fs.readFileSync(ROOT_OF_TRUST, "utf8"));
  mutate(rot);
  const file = path.join(dir, "root-of-trust.json");
  fs.writeFileSync(file, JSON.stringify(rot));
  return ["--root-of-trust", file];
};

describe("Review-policy evaluator (REVIEW-02)", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-policy-"));
    assert.ok(fs.existsSync(TOOL), "tools/review-policy/evaluate.mjs is not built yet");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("[REVIEW-02] the fixture is valid review facts", () => {
    assert.ok(validFacts(FIXTURE), JSON.stringify(validFacts.errors, null, 2));
  });

  // --- Eligible changes -----------------------------------------------------------------
  it("[REVIEW-02] approves implementation and documentation changes whose required checks all passed on the head commit", () => {
    const d = approved(facts());
    assert.equal(d.pullRequest, 42);
    assert.equal(d.headSha, HEAD);
    assert.equal(d.repository, FIXTURE.repository);
    assert.equal(d.generatedAt, NOW);
    assert.deepEqual(d.files.map((f) => [f.path, f.class, f.approverMayApprove]), [
      ["services/customer/server.js", "implementation", true],
      ["docs/design/example.md", "documentation", true],
    ]);
    assert.deepEqual(d.requiredChecks, REQUIRED.map((name) => ({ name, conclusion: "success" })));
  });

  it("[REVIEW-02] approves a documentation-only change", () => {
    const d = approved(facts((f) => { f.changedFiles = ["README.md", "docs/README.md"]; }));
    assert.equal(d.changeClass, "documentation");
  });

  it("[REVIEW-02] records the policy's schema and the SHA-256 of its bytes", () => {
    const d = approved(facts());
    assert.equal(d.policy.schema, "review-policy/1");
    assert.equal(d.policy.sha256, crypto.createHash("sha256").update(fs.readFileSync(POLICY)).digest("hex"));
  });

  it("[REVIEW-02] the same facts and time give a byte-identical record", () => {
    const a = evaluate(facts());
    const b = evaluate(facts());
    assert.equal(a.code, 0, a.out);
    assert.ok(a.bytes.equals(b.bytes), "two runs on the same input differ");
  });

  // --- Paths the approver may not approve -----------------------------------------------
  for (const [file, cls] of [
    ["spec/features/customer/pets.feature", "root-of-trust"],
    ["docs/specs/business-decisions.md", "root-of-trust"],
    [".github/workflows/guard.yml", "root-of-trust"],
    [".claude/settings.json", "root-of-trust"],
    ["AGENTS.md", "root-of-trust"],
    ["CLAUDE.md", "root-of-trust"],
    ["spec/delivery/review-policy.json", "root-of-trust"],
    ["tools/github/agent.mjs", "root-of-trust"],
    ["tools/review-policy/evaluate.mjs", "root-of-trust"],
    ["scripts/ci/review-policy", "privilege-and-supply-chain"],
    ["infra/app.js", "privilege-and-supply-chain"],
    ["compose.yaml", "privilege-and-supply-chain"],
    ["services/customer/package.json", "privilege-and-supply-chain"],
    ["services/platform/package-lock.json", "privilege-and-supply-chain"],
    ["frontend/Dockerfile", "privilege-and-supply-chain"],
  ]) {
    it(`[REVIEW-02] refers a change to ${file} (${cls}) to a human`, () => {
      const d = referred(facts((f) => { f.changedFiles = ["services/customer/server.js", file]; }), "class-not-approvable");
      assert.equal(d.changeClass, cls);
      const entry = d.files.find((x) => x.path === file);
      assert.deepEqual([entry.class, entry.approverMayApprove], [cls, false]);
      assert.ok(d.reasons.find((r) => r.code === "class-not-approvable").detail.includes(file), "the reason doesn't name the path");
    });
  }

  it("[REVIEW-02] a path in two classes takes the more restrictive one, whatever order the policy lists them in", () => {
    const p = JSON.parse(fs.readFileSync(POLICY, "utf8"));
    p.classes.reverse();
    const file = path.join(dir, "policy.json");
    fs.writeFileSync(file, JSON.stringify(p));
    for (const [changed, cls] of [["docs/specs/domain-model.md", "root-of-trust"], ["services/customer/package.json", "privilege-and-supply-chain"]]) {
      const d = referred(facts((f) => { f.changedFiles = [changed]; }), "class-not-approvable", ["--policy", file]);
      assert.equal(d.files[0].class, cls);
    }
  });

  it("[REVIEW-02] a path no class names falls in the policy's unmatched class and is referred", () => {
    const d = referred(facts((f) => { f.changedFiles = ["an-unlisted-folder/notes.txt"]; }), "class-not-approvable");
    assert.equal(d.files[0].class, "root-of-trust");
  });

  it("[REVIEW-02] a pull request with no changed files is referred", () => {
    const d = referred(facts((f) => { f.changedFiles = []; }), "no-changed-files");
    assert.equal(d.changeClass, null);
  });

  // --- Required checks ------------------------------------------------------------------
  it("[REVIEW-02] required checks come from the root of trust, not from the facts", () => {
    const d = referred(facts((f) => { f.checkRuns = f.checkRuns.filter((c) => c.name !== "Application suite"); }), "check-missing");
    assert.ok(d.reasons.find((r) => r.code === "check-missing").detail.includes("Application suite"));
    assert.deepEqual(d.requiredChecks.find((c) => c.name === "Application suite"), { name: "Application suite", conclusion: null });
  });

  it("[REVIEW-02] a passing check on an older commit doesn't count", () => {
    referred(facts((f) => { f.checkRuns = f.checkRuns.map((c) => (c.name === "Delivery spec" ? { ...c, headSha: OLD } : c)); }), "check-missing");
  });

  for (const conclusion of ["failure", "neutral", "cancelled", "skipped", "timed_out", "action_required", "stale"]) {
    it(`[REVIEW-02] a required check that concluded ${conclusion} is referred`, () => {
      referred(facts((f) => { f.checkRuns = [...f.checkRuns.filter((c) => c.name !== "Application suite"), run("Application suite", conclusion)]; }), "check-not-successful");
    });
  }

  it("[REVIEW-02] a required check still queued or running counts as missing", () => {
    for (const status of ["queued", "in_progress"]) {
      referred(facts((f) => { f.checkRuns = [...f.checkRuns.filter((c) => c.name !== "Application suite"), run("Application suite", null, { status, completedAt: null })]; }), "check-missing");
    }
  });

  it("[REVIEW-02] when a check ran more than once on the head commit, the latest completed run decides", () => {
    const rerun = (first, second) => (f) => {
      f.checkRuns = [
        ...f.checkRuns.filter((c) => c.name !== "Application suite"),
        run("Application suite", first, { completedAt: "2026-10-16T11:00:00Z" }),
        run("Application suite", second, { completedAt: "2026-10-16T11:30:00Z" }),
      ];
    };
    approved(facts(rerun("failure", "success")));
    referred(facts(rerun("success", "failure")), "check-not-successful");
  });

  it("[REVIEW-02] a check run with an unrelated name never satisfies a required check", () => {
    referred(facts((f) => { f.checkRuns = f.checkRuns.map((c) => (c.name === "Delivery spec" ? { ...c, name: "Delivery spec (copy)" } : c)); }), "check-missing");
  });

  it("[REVIEW-02] a branch that is not up to date with its base is referred", () => {
    referred(facts((f) => { f.pullRequest.upToDate = false; }), "branch-not-up-to-date");
  });

  // --- Switches and identities ----------------------------------------------------------
  it("[REVIEW-02] the approver is off unless its switch is explicitly on", () => {
    referred(facts((f) => { f.approverEnabled = false; }), "approver-disabled");
    referred(facts((f) => { f.approverEnabled = null; }), "approver-disabled");
  });

  it("[REVIEW-02] the policy's needs-human label refers the pull request", () => {
    const label = JSON.parse(fs.readFileSync(POLICY, "utf8")).killSwitch.label;
    referred(facts((f) => { f.pullRequest.labels = ["documentation", label]; }), "needs-human-label");
  });

  it("[REVIEW-02] a draft pull request is referred", () => {
    referred(facts((f) => { f.pullRequest.draft = true; }), "draft");
  });

  it("[REVIEW-02] a pull request authored by an approver identity is referred", () => {
    const extra = withRootOfTrust((rot) => { rot.approverIdentities = ["ai-sdlc-review-bot[bot]"]; });
    approved(facts(), extra);
    referred(facts((f) => { f.pullRequest.author = "ai-sdlc-review-bot[bot]"; }), "author-is-approver", extra);
  });

  it("[REVIEW-02] every reason is reported, not only the first", () => {
    const d = decided(facts((f) => {
      f.approverEnabled = false;
      f.pullRequest.upToDate = false;
      f.pullRequest.draft = true;
      f.changedFiles = ["spec/README.md"];
      f.checkRuns = [];
    }));
    const codes = new Set(d.reasons.map((r) => r.code));
    for (const code of ["approver-disabled", "branch-not-up-to-date", "draft", "class-not-approvable", "check-missing"]) assert.ok(codes.has(code), `missing reason ${code}`);
    assert.equal(d.reasons.filter((r) => r.code === "check-missing").length, REQUIRED.length, "one check-missing reason per required check");
  });

  // --- Rejected input: no record --------------------------------------------------------
  it("[REVIEW-02] rejects facts that don't match the contract", () => {
    rejected(facts((f) => { f.kind = "something-else"; }), "a wrong kind");
    rejected(facts((f) => { f.pullRequest.headSha = "abc"; }), "a short head SHA");
    rejected(facts((f) => { f.changedFiles = ["/etc/passwd"]; }), "an absolute path");
    rejected(facts((f) => { f.extra = true; }), "an unknown property");
    rejected(facts((f) => { delete f.approverEnabled; }), "a missing kill-switch value");
  });

  it("[REVIEW-02] rejects a missing or malformed --now", () => {
    const factsFile = path.join(dir, "facts.json");
    const out = path.join(dir, "decision.json");
    fs.writeFileSync(factsFile, JSON.stringify(facts()));
    for (const args of [["--facts", factsFile, "--out", out], ["--facts", factsFile, "--now", "yesterday", "--out", out]]) {
      const r = spawnSync(process.execPath, [TOOL, ...args], { cwd: dir, encoding: "utf8" });
      assert.notEqual(r.status, 0, `accepted ${args.join(" ")}`);
      assert.equal(fs.existsSync(out), false);
    }
  });

  it("[REVIEW-02] rejects a policy with an unknown schema or an undefined unmatched class", () => {
    const write = (mutate) => {
      const p = JSON.parse(fs.readFileSync(POLICY, "utf8"));
      mutate(p);
      const file = path.join(dir, "policy.json");
      fs.writeFileSync(file, JSON.stringify(p));
      return ["--policy", file];
    };
    rejected(facts(), "an unknown policy schema", write((p) => { p.schema = "review-policy/99"; }));
    rejected(facts(), "an undefined unmatched class", write((p) => { p.unmatchedClass = "nowhere"; }));
  });

  it("[REVIEW-02] rejects a root of trust that names no required checks", () => {
    rejected(facts(), "no required checks", withRootOfTrust((rot) => { rot.requiredChecks = []; }));
  });
});
