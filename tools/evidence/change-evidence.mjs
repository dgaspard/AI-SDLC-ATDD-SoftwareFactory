// EVID-01 local slice: one report of what was checked on an exact source tree, and what remains
// unknown. Contract: spec/delivery/contracts/change-evidence.v1.schema.json. Tests:
// spec/tests/evidence/change-evidence.test.js.
//
//   node tools/evidence/change-evidence.mjs [--now <ISO time>] [--ci-url <url>]
//       Writes test-results/evidence/<id>/change-evidence.{json,md}. Exits 0 whenever a report is
//       written, whatever the gate says; 2 when inputs are unusable (and then writes nothing).
//   node tools/evidence/change-evidence.mjs --verify <change-evidence.json>
//       Exits 0 only for a well-formed, COMPLETE report of the current tree; 1 otherwise.
//
// It never reruns tests. Tree identity, test policy and gate status come from the runner's own
// verifier (`node spec/run-all.js --verify --json`); controls and accepted risks come from the
// feature files on this tree. It reads no logs, so no log content can leak into the report.
import { spawnSync, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "test-results", "evidence");
const MAX_FILE = 1024 * 1024; // bounded reads: feature files and reports are small
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const RUN_ID = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;
const LOG = /^test-results\/runs\/[0-9A-Za-z._/-]+$/;

class InputError extends Error {}

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

// ---------- inputs ----------

function verifierView() {
  if (!fs.existsSync(path.join(ROOT, "spec", "run-all.js")))
    throw new InputError("spec/run-all.js not found");
  const r = spawnSync(
    process.execPath,
    ["spec/run-all.js", "--verify", "--json"],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (r.status !== 0 && r.status !== 1)
    throw new InputError(`verifier exited ${r.status}: ${r.stderr.trim()}`);
  let view;
  try {
    view = JSON.parse(r.stdout);
  } catch {
    throw new InputError("verifier output is not JSON");
  }
  if (
    view?.schema !== 1 ||
    !/^[0-9a-f]{40}$/.test(view.tree ?? "") ||
    !Array.isArray(view.suites)
  ) {
    throw new InputError("verifier output has an unexpected shape");
  }
  return view;
}

function readBounded(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_FILE)
    throw new InputError(`${path.relative(ROOT, file)} is not a readable file`);
  return fs.readFileSync(file, "utf8");
}

/** .feature files under one repository directory; symlinks are not followed. */
function featureFiles(rel) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of fs
      .readdirSync(d, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".feature")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Scenarios with their effective tags (feature tags plus scenario tags). Commented lines are ignored. */
function scenarios(file) {
  const lines = readBounded(file).split("\n");
  let featureTags = [];
  let pending = [];
  let pendingLine = null;
  const found = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith("@")) {
      pending.push(...line.split(/\s+/).filter((t) => t.startsWith("@")));
      pendingLine ??= i + 1;
    } else if (/^Feature:/.test(line)) {
      featureTags = pending;
      pending = [];
      pendingLine = null;
    } else if (/^(Examples|Scenarios|Background|Rule):/.test(line)) {
      // Tags above these belong to them, never to the next scenario.
      pending = [];
      pendingLine = null;
    } else if (/^(Scenario( Outline| Template)?|Example):/.test(line)) {
      found.push({ featureTags, tags: pending, tagLine: pendingLine });
      pending = [];
      pendingLine = null;
    }
  });
  return found;
}

const tagValue = (tags, prefix) =>
  tags.find((t) => t.startsWith(`@${prefix}:`))?.slice(prefix.length + 2) ??
  null;

function controls(delivery, limitations) {
  const result = [];
  for (const file of featureFiles("spec/delivery/features")) {
    for (const s of scenarios(file)) {
      const id = s.tags.find((t) => /^@CTL-\d{3}$/.test(t))?.slice(1);
      if (!id) continue;
      // Feature tags are inherited, as cucumber's profiles see them: a feature-level
      // @awaiting or @tier:live applies to every scenario in it.
      const all = [...s.tags, ...s.featureTags];
      const tier = all.includes("@tier:live")
        ? "live"
        : (tagValue(s.tags, "tier") ?? tagValue(s.featureTags, "tier"));
      if (!["static", "template", "live"].includes(tier)) {
        limitations.push(`${id} has no valid tier tag and is left out.`);
        continue;
      }
      const awaiting = tagValue(all, "awaiting");
      let res;
      let evidence = null;
      if (awaiting) res = "awaiting";
      else if (tier === "live" || delivery.status === "missing")
        res = "not-run";
      else {
        res = delivery.status === "pass" ? "passed" : "suite-failed";
        evidence = delivery.runId;
      }
      result.push({
        id,
        tier,
        environments: [
          ...new Set(
            s.tags.filter((t) => t.startsWith("@env:")).map((t) => t.slice(5)),
          ),
        ],
        requirement: awaiting ? "awaiting" : "required",
        awaiting,
        result: res,
        evidence,
      });
    }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

function acceptedRisks() {
  const risks = [];
  for (const file of [
    ...featureFiles("spec/features"),
    ...featureFiles("spec/delivery/features"),
  ]) {
    for (const s of scenarios(file)) {
      if (!s.tags.includes("@accepted-risk")) continue;
      const review = tagValue(s.tags, "review");
      risks.push({
        id: tagValue(s.tags, "risk") ?? "unnamed",
        owner: tagValue(s.tags, "owner"),
        review: /^\d{4}-\d{2}-\d{2}$/.test(review ?? "") ? review : null,
        source: `${path.relative(ROOT, file).split(path.sep).join("/")}:${s.tagLine}`,
      });
    }
  }
  return risks;
}

function repository() {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function sha256File(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p)
    ? crypto.createHash("sha256").update(readBounded(p)).digest("hex")
    : null;
}

// ---------- the report ----------

function buildReport(now) {
  const v = verifierView();
  const limitations = [];
  const integer = (n) => (Number.isInteger(n) && n >= 0 ? n : null);
  const suites = v.suites.map((s) => ({
    id: String(s.id),
    name: String(s.name ?? s.id),
    required: true,
    result: { pass: "passed", fail: "failed" }[s.status] ?? "not-run",
    runId: RUN_ID.test(s.runId ?? "") ? s.runId : null,
    cachedFrom: RUN_ID.test(s.cachedFrom ?? "") ? s.cachedFrom : null,
    counts:
      s.counts && integer(s.counts.tests) !== null
        ? {
            tests: s.counts.tests,
            passed: integer(s.counts.passed),
            failed: integer(s.counts.failed),
            skipped: integer(s.counts.skipped),
          }
        : null,
    durationMs: integer(s.durationMs),
    log: LOG.test(s.log ?? "") && !s.log.includes("..") ? s.log : null,
  }));
  const delivery = v.suites.find((s) => s.id === "delivery") ?? {
    status: "missing",
    runId: null,
  };
  const ctl = controls(
    {
      ...delivery,
      runId: RUN_ID.test(delivery.runId ?? "") ? delivery.runId : null,
    },
    limitations,
  );
  const gate = v.complete
    ? "COMPLETE"
    : v.failed.length
      ? "FAILED"
      : "INCOMPLETE";

  const ci = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
  const ciUrl =
    opt("--ci-url") ??
    (ci &&
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null);

  const live = ctl.filter(
    (c) => c.tier === "live" && c.requirement === "required",
  );
  const awaiting = ctl.filter((c) => c.requirement === "awaiting");
  limitations.unshift(
    "No deployment was performed; this report covers source-tree verification only.",
  );
  if (live.length || awaiting.length) {
    limitations.push(
      `Cloud readiness is unproven: ${live.length} live-tier control(s) were not run here and ${awaiting.length} control(s) await implementation.`,
    );
  }
  if (gate !== "COMPLETE") {
    limitations.push(
      `Required suites failed: ${v.failed.join(", ") || "none"}; missing on this tree: ${v.missing.join(", ") || "none"}.`,
    );
  }
  if (v.unreadable)
    limitations.push(
      `${v.unreadable} unreadable run record${v.unreadable === 1 ? "" : "s"} were ignored.`,
    );
  limitations.push(
    "Human review and remote enforcement are not verified by this report.",
    "Run records are local files trusted as written; they are not signed.",
  );
  if (ci || ciUrl) {
    limitations.push(
      "The execution origin and CI URL are reported by the environment, not verified.",
    );
  }

  return {
    schemaVersion: 1,
    kind: "change-evidence",
    generatedAt: now,
    runIds: [...new Set(suites.map((s) => s.runId).filter(Boolean))],
    source: {
      repository: repository(),
      head: /^[0-9a-f]{40}$/.test(v.head ?? "") ? v.head : null,
      sourceTree: v.tree,
      dirty: Boolean(v.dirty),
      branch: v.branch ?? null,
    },
    specification: {
      protectedManifestSha256: sha256File("spec/protected.sha256"),
      testPolicySha256: v.policy.sha256,
    },
    execution: {
      origin: ci ? "ci" : "local",
      ciUrl,
      nodeMajor: String(v.nodeMajor),
    },
    verification: {
      gate,
      missing: v.missing,
      failed: v.failed,
      unreadableRecords: integer(v.unreadable) ?? 0,
    },
    suites,
    controls: ctl,
    risks: {
      acceptedRisks: acceptedRisks(),
      stateChanges: (v.stateChanges ?? []).map(String),
    },
    humanDecision: { status: "unrecorded", reference: null, verified: false },
    remoteEnforcement: { status: "unknown", reference: null },
    limitations,
  };
}

/** Escape untrusted text for one Markdown line or table cell (not for code spans). */
const esc = (s) =>
  String(s)
    .replace(/\\/g, "\\\\")
    .replace(/[[\]!*_]/g, (c) => `\\${c}`)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/[\r\n]+/g, " ");

function markdown(r) {
  const short = (h) => (h ? h.slice(0, 12) : "none");
  const L = [];
  L.push("# Change evidence", "");
  L.push(
    `**Gate: ${r.verification.gate}** · tree \`${short(r.source.sourceTree)}\` (${r.source.dirty ? "uncommitted changes" : "matches HEAD"}) · HEAD \`${short(r.source.head)}\` · branch ${esc(r.source.branch ?? "none")} · ${esc(r.source.repository ?? "no remote")}`,
  );
  L.push(
    `Generated ${esc(r.generatedAt)} (${r.execution.origin}${r.execution.ciUrl ? `, ${esc(r.execution.ciUrl)}` : ""}). Node ${esc(r.execution.nodeMajor)}.`,
    "",
  );
  if (r.risks.stateChanges.length) {
    L.push(
      "> **Accepted-risk STATE CHANGE (SPEC-07). Report this to a human:**",
    );
    for (const c of r.risks.stateChanges) L.push(`> - ${esc(c)}`);
    L.push("");
  }

  L.push("## Unresolved risks", "");
  if (r.verification.failed.length)
    L.push(
      `- Failed required suites: ${r.verification.failed.map(esc).join(", ")}`,
    );
  if (r.verification.missing.length)
    L.push(
      `- Required suites with no result on this tree: ${r.verification.missing.map(esc).join(", ")}`,
    );
  for (const a of r.risks.acceptedRisks) {
    L.push(
      `- Accepted risk ${esc(a.id)}: owner ${esc(a.owner ?? "unknown")}, review by ${esc(a.review ?? "unknown")} (${esc(a.source)})`,
    );
  }
  if (
    !r.verification.failed.length &&
    !r.verification.missing.length &&
    !r.risks.acceptedRisks.length
  )
    L.push("- None recorded.");
  if (r.verification.unreadableRecords) {
    L.push(
      `- ${r.verification.unreadableRecords} unreadable run record${r.verification.unreadableRecords === 1 ? "" : "s"} ignored`,
    );
  }
  L.push("");

  L.push(
    "## Required suites",
    "",
    "| Suite | Result | Tests | Run |",
    "| --- | --- | --- | --- |",
  );
  for (const s of r.suites) {
    const c = s.counts ? `${s.counts.passed ?? "?"}/${s.counts.tests}` : "—";
    const run = s.runId
      ? `${esc(s.runId)}${s.cachedFrom ? " (reused)" : ""}`
      : "—";
    L.push(`| ${esc(s.name)} | ${s.result} | ${c} | ${run} |`);
  }
  L.push("");

  L.push("## Delivery controls", "");
  const groups = [
    ["Passed", "passed"],
    ["Unverified: their suite failed", "suite-failed"],
    ["Not run on this tree", "not-run"],
    ["Awaiting implementation", "awaiting"],
  ];
  for (const [title, key] of groups) {
    const items = r.controls.filter((c) => c.result === key);
    L.push(`**${title}** (${items.length})${items.length ? ":" : ""}`);
    for (const c of items) {
      L.push(
        `- ${esc(c.id)} (${c.tier}; ${c.environments.map(esc).join(", ") || "no env"})${c.awaiting ? ` awaiting ${esc(c.awaiting)}` : ""}`,
      );
    }
    L.push("");
  }
  if (
    r.controls.some(
      (c) =>
        (c.tier === "live" && c.requirement === "required") ||
        c.requirement === "awaiting",
    )
  ) {
    L.push(
      "Cloud readiness is unproven: live-tier controls don't run here, and awaiting controls aren't built.",
      "",
    );
  }

  L.push("## Human review and remote enforcement", "");
  L.push(
    `- Human review: ${r.humanDecision.status === "unrecorded" ? "not recorded" : `recorded (${esc(r.humanDecision.reference ?? "")}), ${r.humanDecision.verified ? "verified" : "a statement, not verified"}`}.`,
  );
  L.push(
    `- Remote enforcement: ${r.remoteEnforcement.status === "verified" ? "verified" : "not verified"} by this report.`,
    "",
  );

  L.push("## Evidence", "");
  L.push(
    `- Run records: ${r.runIds.length ? r.runIds.map((id) => `\`test-results/runs/${id}.json\``).join(", ") : "none"}`,
  );
  for (const s of r.suites.filter((x) => x.log))
    L.push(`- ${esc(s.name)} log: \`${s.log}\``); // charset-checked above
  L.push(`- Test policy sha256: \`${r.specification.testPolicySha256}\``);
  L.push(
    `- Protected manifest sha256: \`${r.specification.protectedManifestSha256 ?? "none"}\``,
    "",
  );

  L.push("## Limitations", "");
  for (const l of r.limitations) L.push(`- ${esc(l)}`);
  return L.join("\n") + "\n";
}

/** Writes both files to a temporary directory, then renames it, so a failure never leaves a partial report. */
function write(report) {
  fs.mkdirSync(OUT, { recursive: true });
  const base = `${report.generatedAt.replace(/[:.]/g, "-")}-${report.source.sourceTree.slice(0, 12)}`;
  let id = base;
  for (let n = 2; fs.existsSync(path.join(OUT, id)); n++) id = `${base}-${n}`;
  const tmp = fs.mkdtempSync(path.join(OUT, ".tmp-"));
  try {
    fs.writeFileSync(
      path.join(tmp, "change-evidence.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    fs.writeFileSync(path.join(tmp, "change-evidence.md"), markdown(report));
    fs.renameSync(tmp, path.join(OUT, id));
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
  return path.join(OUT, id);
}

// ---------- strict check ----------

function verify(file) {
  const problems = [];
  let doc;
  try {
    doc = JSON.parse(readBounded(path.resolve(ROOT, file)));
  } catch (error) {
    return [`cannot read ${file}: ${error.message}`];
  }
  if (doc?.kind !== "change-evidence" || doc?.schemaVersion !== 1)
    problems.push("not a change-evidence v1 report");
  if (problems.length) return problems;
  for (const k of [
    "source",
    "specification",
    "execution",
    "verification",
    "risks",
    "humanDecision",
    "remoteEnforcement",
  ]) {
    if (!doc[k] || typeof doc[k] !== "object" || Array.isArray(doc[k]))
      problems.push(`missing ${k}`);
  }
  for (const k of ["runIds", "suites", "controls", "limitations"]) {
    if (!Array.isArray(doc[k])) problems.push(`missing ${k}`);
  }
  if (typeof doc.generatedAt !== "string" || !ISO.test(doc.generatedAt))
    problems.push("missing generatedAt");
  if (problems.length) return problems;
  // Every claim must be what the generator derives now from this tree's verifier and features,
  // so an edited report (a forged gate, suite result, control, approver or enforcement claim)
  // fails. Only the generation time and execution context (origin, CI URL) can't be rederived.
  const current = buildReport(doc.generatedAt);
  if (doc.source.sourceTree !== current.source.sourceTree)
    problems.push(
      `report is for tree ${String(doc.source.sourceTree).slice(0, 12)}, current tree is ${current.source.sourceTree.slice(0, 12)}`,
    );
  if (
    doc.specification.testPolicySha256 !==
    current.specification.testPolicySha256
  )
    problems.push("report was made under a different test policy");
  if (doc.verification.gate !== "COMPLETE")
    problems.push(`report gate is ${doc.verification.gate}`);
  if (current.verification.gate !== "COMPLETE")
    problems.push(
      `the verifier does not find this tree complete (failed: ${current.verification.failed.join(", ") || "none"}; missing: ${current.verification.missing.join(", ") || "none"})`,
    );
  if (problems.length) return problems;
  const differ = Object.keys({ ...current, ...doc }).filter(
    (k) =>
      !["generatedAt", "execution"].includes(k) &&
      JSON.stringify(doc[k]) !== JSON.stringify(current[k]),
  );
  if (differ.length)
    problems.push(
      `report differs from the current evidence in: ${differ.join(", ")} (edited, or superseded by a later run)`,
    );
  return problems;
}

// ---------- main ----------

try {
  if (argv.includes("--verify")) {
    const file = opt("--verify");
    if (!file) throw new InputError("usage: --verify <change-evidence.json>");
    const problems = verify(file);
    if (problems.length) {
      for (const p of problems) console.error(`evidence: ${p}`);
      process.exit(1);
    }
    console.log(`evidence: ${file} is a complete report of the current tree.`);
  } else {
    const now = opt("--now") ?? new Date().toISOString();
    if (!ISO.test(now) || Number.isNaN(Date.parse(now)))
      throw new InputError(`--now must be an ISO 8601 time, got "${now}"`);
    const report = buildReport(now);
    const dir = write(report);
    console.log(
      `Gate: ${report.verification.gate} on tree ${report.source.sourceTree.slice(0, 12)}`,
    );
    console.log(path.relative(ROOT, path.join(dir, "change-evidence.md")));
    console.log(path.relative(ROOT, path.join(dir, "change-evidence.json")));
  }
} catch (error) {
  console.error(
    `evidence: ${error instanceof InputError ? error.message : error.stack}`,
  );
  process.exit(2);
}
