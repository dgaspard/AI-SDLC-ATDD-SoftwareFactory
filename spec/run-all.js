// Test runner and run record (PERF-03). Protected scaffolding: humans own what counts as tested.
//
//   node run-all.js                    full tier, every suite, no cache (npm test; CI)
//   node run-all.js --tier fast        inner loop: always-set + suites selected by changed paths
//   node run-all.js --tier full --cache  the gate: run only suites not yet passed on this exact tree
//   node run-all.js --suite auth,observability   run named suites (unscoped results count toward the gate)
//   node run-all.js --verify           run nothing; exit 0 only if the gate is complete for this tree
//   --verify --json                    the same, printed as JSON for evidence reports (EVID-01)
//   --dry-run                          print what would run and why, run nothing
//   --diff A..B                        fast tier: select from paths changed between two refs (CI, PRs)
//
// Every run writes test-results/runs/<runId>.json (what ran, why, on which tree, with what result)
// and test-results/runs/<runId>/<suite>.log. The tree hash covers tracked and untracked,
// non-ignored files, so a record proves which exact code was tested.
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECTS } from "./harness/config.js";

const SPEC = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SPEC, "..");
const RUNS = path.join(ROOT, "test-results", "runs");
const POLICY_FILE = path.join(SPEC, "test-policy.json");
const policyText = fs.readFileSync(POLICY_FILE, "utf8");
const policy = JSON.parse(policyText);
const policySha = crypto.createHash("sha256").update(policyText).digest("hex");
const nodeMajor = process.versions.node.split(".")[0];
const SERVICES = Object.keys(PROJECTS).filter((n) => PROJECTS[n].kind === "service");
const FULL = policy.tiers.full.suites;

// ---------- arguments ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const tier = opt("--tier") ?? "full";
const useCache = flag("--cache");
const verifyOnly = flag("--verify");
const onlySuites = opt("--suite")?.split(",").map((s) => s.trim()).filter(Boolean);
if (!policy.tiers[tier]) die(`unknown tier "${tier}"; expected ${Object.keys(policy.tiers).join(" | ")}`);
for (const id of onlySuites ?? []) if (!policy.suites[id]) die(`unknown suite "${id}"; expected ${Object.keys(policy.suites).join(", ")}`);

function die(msg) { console.error(`run-all: ${msg}`); process.exit(2); }
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };

// ---------- exact working tree ----------
function workingTree() {
  const idx = path.join(os.tmpdir(), `run-all-index-${process.pid}-${Date.now()}`);
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  const g = (...a) => execFileSync("git", a, { cwd: ROOT, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    if (tryGit("rev-parse", "--verify", "-q", "HEAD")) g("read-tree", "HEAD");
    g("add", "-A");
    return g("write-tree");
  } finally { fs.rmSync(idx, { force: true }); }
}
const head = tryGit("rev-parse", "HEAD");
const headTree = tryGit("rev-parse", "HEAD^{tree}");
const tree = workingTree();
const gitInfo = { branch: tryGit("rev-parse", "--abbrev-ref", "HEAD"), head, treeHash: tree, dirty: tree !== headTree };

// ---------- earlier records ----------
let unreadable = 0; // CI-02: malformed records never count, and the verifier says how many it skipped.
function readRecords() {
  if (!fs.existsSync(RUNS)) return [];
  return fs.readdirSync(RUNS).filter((f) => f.endsWith(".json")).flatMap((f) => {
    try { return [JSON.parse(fs.readFileSync(path.join(RUNS, f), "utf8"))]; } catch { unreadable++; return []; }
  }).sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)));
}
// CI-02: a pass counts only if its log still exists under test-results/runs/, so a record
// alone can't vouch for a run.
const logExists = (s) => typeof s.log === "string" && !s.log.split("/").includes("..")
  && s.log.startsWith("test-results/runs/") && fs.existsSync(path.join(ROOT, s.log));
const sameBasis = (r) => r.git?.treeHash === tree && r.policy?.sha256 === policySha && r.environment?.nodeMajor === nodeMajor;
/** Passing, unscoped results for this exact tree, policy, and Node major: suiteId -> { runId, result }.
 *  Records are in time order; a later failure on the same basis revokes an earlier pass (CI-02). */
function provenSuites(records) {
  const proven = new Map();
  for (const r of records.filter(sameBasis)) {
    for (const s of r.suites ?? []) {
      if (s.status === "pass" && !s.scope && logExists(s)) proven.set(s.id, { runId: s.cachedFrom ?? r.runId, result: s });
      else if (s.status !== "pass") proven.delete(s.id);
    }
  }
  return proven;
}
function gateStatus(records) {
  const proven = provenSuites(records);
  const missing = FULL.filter((id) => !proven.has(id));
  return { tier: "full", complete: missing.length === 0, missing,
    provenBy: Object.fromEntries(FULL.filter((id) => proven.has(id)).map((id) => [id, proven.get(id).runId])) };
}

// EVID-01: the verifier's view as JSON, so evidence reports reuse its tree identity and rules
// instead of re-deriving them. Each full-tier suite is pass (proven on this basis), fail (its
// latest result on this basis failed) or missing.
function verifyReport(records, gate) {
  const basis = records.filter(sameBasis);
  const proven = provenSuites(records);
  const latest = new Map();
  for (const r of basis) for (const s of r.suites ?? []) if (!s.scope) latest.set(s.id, { runId: s.cachedFrom ?? r.runId, result: s });
  const suites = FULL.map((id) => {
    const l = latest.get(id);
    const status = proven.has(id) ? "pass" : l && l.result.status !== "pass" ? "fail" : "missing";
    const pick = status === "pass" ? proven.get(id) : status === "fail" ? l : null;
    return { id, name: policy.suites[id].name, status, runId: pick?.runId ?? null, cachedFrom: pick?.result.cachedFrom ?? null,
      counts: pick?.result.counts ?? null, durationMs: pick?.result.durationMs ?? null, log: pick?.result.log ?? null };
  });
  return { schema: 1, tree, head, branch: gitInfo.branch, dirty: gitInfo.dirty, nodeMajor,
    policy: { file: "spec/test-policy.json", sha256: policySha }, complete: gate.complete,
    missing: suites.filter((s) => s.status === "missing").map((s) => s.id),
    failed: suites.filter((s) => s.status === "fail").map((s) => s.id),
    unreadable, suites, stateChanges: [...new Set(basis.flatMap((r) => r.stateChanges ?? []))] };
}

const prior = readRecords();
if (verifyOnly) {
  const gate = gateStatus(prior);
  if (flag("--json")) {
    console.log(JSON.stringify(verifyReport(prior, gate), null, 2));
    process.exit(gate.complete ? 0 : 1);
  }
  console.log(gate.complete
    ? `GATE PASS: every full-tier suite passed on tree ${tree.slice(0, 12)}.`
    : `GATE INCOMPLETE on tree ${tree.slice(0, 12)}${gitInfo.dirty ? " (uncommitted changes)" : ""}. Missing: ${gate.missing.join(", ")}`);
  if (unreadable) console.log(`Ignored ${unreadable} unreadable run record${unreadable === 1 ? "" : "s"} in test-results/runs/.`);
  process.exit(gate.complete ? 0 : 1);
}

// ---------- selection ----------
function matchRule(file) {
  for (const rule of policy.rules.list) {
    for (const p of rule.paths) {
      if (p.includes("{service}")) {
        const [pre, post] = p.split("{service}");
        if (!file.startsWith(pre)) continue;
        const svc = file.slice(pre.length).split("/")[0];
        if (SERVICES.includes(svc) && file.startsWith(pre + svc + post)) return { rule, pattern: p, service: svc };
      } else if (p.endsWith("/") ? file.startsWith(p) : file === p) return { rule, pattern: p };
    }
  }
  return null;
}

let base = null, changed = [];
const chosen = new Map(); // id -> { reasons: [], scopes: Set|null }
const pick = (id, reason, scope) => {
  const c = chosen.get(id) ?? { reasons: [], scopes: new Set(), unscoped: false };
  c.reasons.push(reason);
  if (scope) c.scopes.add(scope); else c.unscoped = true;
  chosen.set(id, c);
};

if (onlySuites) {
  for (const id of onlySuites) pick(id, "requested with --suite");
} else if (tier === "full") {
  for (const id of FULL) pick(id, "full tier");
} else {
  const lastVerified = [...prior].reverse().find((r) => r.gate?.complete);
  base = opt("--base") ? { ref: opt("--base"), why: "--base" }
    : lastVerified ? { ref: lastVerified.git.treeHash, why: `last verified tree (run ${lastVerified.runId})` }
    : tryGit("merge-base", "HEAD", "main") ? { ref: git("merge-base", "HEAD", "main"), why: "merge-base with main (no verified run yet)" }
    : { ref: head, why: "HEAD (no verified run, no main)" };
  const range = opt("--diff")?.split(/\.\.\.?/);
  if (range) base = { ref: range[0], why: `--diff ${opt("--diff")}` };
  changed = (tryGit("diff", "--name-only", base.ref, range ? range[1] : tree) ?? "").split("\n").filter(Boolean);
  for (const id of policy.tiers.fast.always) pick(id, "always in fast tier");
  for (const file of changed) {
    const m = matchRule(file);
    const suites = !m || m.rule.suites === "all" ? FULL : m.rule.suites;
    const why = m ? `${file} matched ${m.pattern}` : `${file} matched no rule (selects every suite)`;
    for (const id of suites) {
      const scoped = m?.service && (m.rule.scoped ?? []).includes(id) && policy.suites[id].scopeByService;
      pick(id, why, scoped ? m.service : null);
    }
  }
}
const order = Object.keys(policy.suites);
const plan = [...chosen.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([id, c]) => {
  const def = policy.suites[id];
  const scope = c.unscoped ? null : [...c.scopes].sort();
  const args = scope ? [def.scopeByService.args[0], ...scope.map((s) => def.scopeByService.args[1].replace("{service}", s))] : def.args;
  return { id, name: def.name, cmd: def.cmd, args, scope, reasons: [...new Set(c.reasons)] };
});

if (flag("--dry-run")) {
  if (base) console.log(`base: ${base.ref} (${base.why})\nchanged: ${changed.length ? changed.join(", ") : "(none)"}`);
  for (const s of plan) console.log(`${s.id}${s.scope ? ` [${s.scope.join(", ")}]` : ""}: ${s.cmd} ${s.args.join(" ")}\n    because ${s.reasons.join("; ")}`);
  console.log(`not run: ${Object.keys(policy.suites).filter((id) => !chosen.has(id)).join(", ") || "(none)"}`);
  process.exit(0);
}

// ---------- execution ----------
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${onlySuites ? "suite" : tier}`;
const logDir = path.join(RUNS, runId);
fs.mkdirSync(logDir, { recursive: true });
const proven = useCache ? provenSuites(prior) : new Map();
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

function counts(text) {
  const t = strip(text);
  const last = (re) => { const m = [...t.matchAll(re)]; return m.length ? Number(m.at(-1)[1]) : undefined; };
  const nodeTests = last(/^(?:ℹ|#) tests (\d+)/gm);
  if (nodeTests !== undefined) return { tests: nodeTests, passed: last(/^(?:ℹ|#) pass (\d+)/gm), failed: last(/^(?:ℹ|#) fail (\d+)/gm), skipped: last(/^(?:ℹ|#) skipped (\d+)/gm) };
  const scen = t.match(/(\d+) scenarios? \(([^)]*)\)/);
  if (scen) return { tests: Number(scen[1]), passed: Number(scen[2].match(/(\d+) passed/)?.[1] ?? 0), failed: Number(scen[2].match(/(\d+) failed/)?.[1] ?? 0) };
  const pw = last(/^\s*(\d+) passed/gm), pwFail = last(/^\s*(\d+) failed/gm);
  if (pw !== undefined || pwFail !== undefined) return { tests: (pw ?? 0) + (pwFail ?? 0), passed: pw ?? 0, failed: pwFail ?? 0 };
  return null;
}

function runSuite(s) {
  return new Promise((resolve) => {
    const logFile = path.join(logDir, `${s.id}.log`);
    const log = fs.createWriteStream(logFile);
    let out = "";
    const started = Date.now();
    const child = spawn(s.cmd, s.args, { cwd: SPEC, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: process.stdout.isTTY ? "1" : "0", PETCLINIC_TREE: tree } });
    const tee = (stream) => (chunk) => { stream.write(chunk); log.write(chunk); out += chunk; };
    child.stdout.on("data", tee(process.stdout));
    child.stderr.on("data", tee(process.stderr));
    child.on("close", (code) => {
      log.end();
      resolve({ id: s.id, name: s.name, command: `${s.cmd} ${s.args.join(" ")}`, cwd: "spec", scope: s.scope,
        reasons: s.reasons, status: code === 0 ? "pass" : "fail", exitCode: code, durationMs: Date.now() - started,
        counts: counts(out), log: path.relative(ROOT, logFile),
        // SPEC-07: accepted-risk state, surfaced in the record and the closing banner.
        stateChanges: strip(out).split("\n").filter((l) => /^(STATE CHANGE|NOT REPRODUCING) /.test(l)).map((l) => l.trim()) });
    });
  });
}

const startedAt = new Date();
const results = [];
for (const s of plan) {
  const hit = !s.scope && proven.get(s.id);
  if (hit) {
    console.log(`\n=== ${s.name} === cached: passed on this exact tree in run ${hit.runId}`);
    results.push({ ...hit.result, reasons: s.reasons, status: "pass", cachedFrom: hit.runId, durationMs: 0 });
    continue;
  }
  console.log(`\n=== ${s.name}${s.scope ? ` [scoped: ${s.scope.join(", ")}]` : ""} ===`);
  results.push(await runSuite(s));
}
const finishedAt = new Date();

const record = {
  schema: 1, runId, tier: onlySuites ? "suite" : tier, invocation: `node spec/run-all.js ${argv.join(" ")}`.trim(),
  startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), durationMs: finishedAt - startedAt,
  environment: { node: process.version, nodeMajor, platform: `${process.platform}-${process.arch}`, ci: Boolean(process.env.CI), cache: useCache },
  git: { ...gitInfo, ...(base ? { base: base.ref, baseReason: base.why, changedFiles: changed } : {}) },
  policy: { file: "spec/test-policy.json", sha256: policySha },
  notSelected: Object.keys(policy.suites).filter((id) => !chosen.has(id)),
  suites: results,
  result: results.every((r) => r.status === "pass") ? "pass" : "fail",
  stateChanges: results.flatMap((r) => r.stateChanges ?? []),
};
record.gate = gateStatus([...prior, record]);
fs.writeFileSync(path.join(RUNS, `${runId}.json`), JSON.stringify(record, null, 2) + "\n");

console.log("\n=== Summary ===");
for (const r of results) {
  const c = r.counts ? ` ${r.counts.passed ?? "?"}/${r.counts.tests}` : "";
  const how = r.cachedFrom ? " (cached)" : ` ${(r.durationMs / 1000).toFixed(1)}s`;
  console.log(`${r.status === "pass" ? "PASS" : "FAIL"}  ${r.name}${r.scope ? ` [${r.scope.join(", ")}]` : ""}${c}${how}`);
}
if (record.notSelected.length) console.log(`not run: ${record.notSelected.join(", ")}`);
console.log(`\nRun record: ${path.relative(ROOT, path.join(RUNS, `${runId}.json`))}`);
console.log(record.gate.complete
  ? `Gate: COMPLETE on tree ${tree.slice(0, 12)}. Work may be declared done.`
  : `Gate: incomplete on tree ${tree.slice(0, 12)}. Still needed: ${record.gate.missing.join(", ")}  (npm run test:gate)`);
if (record.stateChanges.length) {
  const bar = "!".repeat(78);
  console.log(`\n${bar}\nACCEPTED-RISK STATE (SPEC-07). Report this to the human:`);
  for (const c of record.stateChanges) console.log(`  ${c}`);
  console.log(`Only a human removes an @accepted-risk tag, through guard:freeze.\n${bar}`);
}
process.exit(record.result === "pass" ? 0 : 1);
