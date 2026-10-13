// DORA-01 local slice: the five DORA metrics from supplied events, under the counting rules in
// spec/delivery/dora.md (calculation version dora-1). The calculator (tools/dora/dora-metrics.mjs)
// is agent-built; these tests, the contracts and the golden fixture are protected. Protected test.
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
const TOOL = path.join(ROOT, "tools/dora/dora-metrics.mjs");
const GOLDEN = JSON.parse(fs.readFileSync(path.join(SPEC, "tests/dora/fixtures/golden.json"), "utf8"));
const schema = (f) => JSON.parse(fs.readFileSync(path.join(SPEC, "delivery/contracts", f), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addFormat("date-time", (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)));
const validEvents = ajv.compile(schema("dora-events.v1.schema.json"));
const validMetrics = ajv.compile(schema("dora-metrics.v1.schema.json"));
const WINDOW = ["--from", "2026-01-01T00:00:00Z", "--to", "2026-01-11T00:00:00Z", "--service", "checkout", "--environment", "production", "--now", "2026-01-20T00:00:00Z"];
const SYNTHETIC = "SYNTHETIC — MEASUREMENT DEMONSTRATION";

let dir;
const clone = () => structuredClone(GOLDEN);
const deployment = (over) => ({ id: "D6", classification: "synthetic", service: "checkout", environment: "production", status: "succeeded", activatedAt: "2026-01-07T12:00:00Z", revision: "r6", commits: [{ sha: "c6c6c6c", committedAt: "2026-01-07T06:00:00Z" }], kind: "planned", triggeredByIncident: null, evidence: null, ...over });
const incident = (over) => ({ id: "I3", classification: "synthetic", service: "checkout", environment: "production", causedByDeployment: "D1", failedAt: "2026-01-07T13:00:00Z", restoredAt: "2026-01-07T14:00:00Z", immediateIntervention: true, recoveryDeployment: null, ...over });
const outputs = () => {
  const base = path.join(dir, "test-results", "dora");
  return fs.existsSync(base) ? fs.readdirSync(base).sort() : [];
};
/** Runs the calculator on `events` and returns { code, out, json, md } for the newest report. */
function calc(events, args = WINDOW) {
  const input = path.join(dir, "events.json");
  fs.writeFileSync(input, JSON.stringify(events, null, 2));
  const before = outputs();
  const r = spawnSync(process.execPath, [TOOL, "--input", input, ...args], { cwd: dir, encoding: "utf8" });
  const added = outputs().filter((d) => !before.includes(d));
  if (!added.length) return { code: r.status, out: `${r.stdout}${r.stderr}`, written: false };
  const d = path.join(dir, "test-results", "dora", added.at(-1));
  return { code: r.status, out: `${r.stdout}${r.stderr}`, written: true, input,
    json: JSON.parse(fs.readFileSync(path.join(d, "dora-metrics.json"), "utf8")), md: fs.readFileSync(path.join(d, "dora-metrics.md"), "utf8") };
}
const ok = (events, args) => {
  const r = calc(events, args);
  assert.equal(r.code, 0, r.out);
  assert.ok(validMetrics(r.json), JSON.stringify(validMetrics.errors, null, 2));
  return r;
};
const rejected = (events, why) => {
  const r = calc(events);
  assert.notEqual(r.code, 0, `${why} was accepted`);
  assert.equal(r.written, false, `${why} still wrote a report`);
};

describe("DORA metrics (DORA-01)", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dora-"));
    assert.ok(fs.existsSync(TOOL), "tools/dora/dora-metrics.mjs is not built yet");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("[DORA-01] the golden fixture is a valid event set", () => {
    assert.ok(validEvents(GOLDEN), JSON.stringify(validEvents.errors, null, 2));
  });

  it("[DORA-01] the golden fixture matches all five hand-calculated results, with denominators and samples", () => {
    const { json, md } = ok(clone());
    const m = json.metrics;
    assert.equal(json.label, SYNTHETIC);
    assert.deepEqual([m.deploymentFrequency.perDay, m.deploymentFrequency.deployments, m.deploymentFrequency.days], [0.5, 5, 10]);
    assert.deepEqual([m.changeLeadTime.medianHours, m.changeLeadTime.samples, m.changeLeadTime.complete], [3, 5, true]);
    assert.deepEqual([m.changeFailRate.rate, m.changeFailRate.failedDeployments, m.changeFailRate.deployments], [0.4, 2, 5]);
    assert.deepEqual([m.failedDeploymentRecoveryTime.medianMinutes, m.failedDeploymentRecoveryTime.recovered, m.failedDeploymentRecoveryTime.open], [60, 2, 0]);
    assert.deepEqual([m.deploymentReworkRate.rate, m.deploymentReworkRate.reworkDeployments, m.deploymentReworkRate.deployments], [0.4, 2, 5]);
    for (const k of Object.keys(m)) assert.equal(m[k].provisional, false, `${k} is provisional`);
    assert.ok(md.includes(SYNTHETIC));
    for (const text of ["0.5 deployments/day", "5 deployments in 10 days", "3 hours", "5 commits", "40%", "2 of 5", "60 minutes", "2 recovered"]) {
      assert.ok(md.includes(text), `Markdown doesn't show "${text}"`);
    }
  });

  it("[DORA-01] an empty real dataset is NOT YET MEASURED, never zero", () => {
    const e = clone();
    e.dataset.classification = "real";
    e.deployments = [];
    e.incidents = [];
    const { json, md } = ok(e);
    assert.equal(json.label, "NOT YET MEASURED");
    const m = json.metrics;
    assert.deepEqual([m.deploymentFrequency.perDay, m.changeLeadTime.medianHours, m.changeFailRate.rate, m.failedDeploymentRecoveryTime.medianMinutes, m.deploymentReworkRate.rate], [null, null, null, null, null]);
    for (const k of Object.keys(m)) assert.ok(m[k].reason, `${k} gives no reason`);
    assert.match(md, /NOT YET MEASURED/);
    assert.ok(!/\b0(\.0+)? deployments\/day|\b0%/.test(md), "an empty dataset was reported as zero");
  });

  it("[DORA-01] complete data with no failures gives a 0% fail rate and no recovery time", () => {
    const e = clone();
    e.incidents = [];
    for (const d of e.deployments) Object.assign(d, { kind: "planned", triggeredByIncident: null });
    const m = ok(e).json.metrics;
    assert.deepEqual([m.changeFailRate.rate, m.changeFailRate.deployments], [0, 5]);
    assert.equal(m.deploymentReworkRate.rate, 0);
    assert.equal(m.failedDeploymentRecoveryTime.medianMinutes, null);
    assert.ok(m.failedDeploymentRecoveryTime.reason);
  });

  it("[DORA-01] open incidents stay visible without distorting the recovery median", () => {
    const e = clone();
    e.incidents[1].restoredAt = null;
    const { json, md } = ok(e);
    const r = json.metrics.failedDeploymentRecoveryTime;
    assert.deepEqual([r.medianMinutes, r.recovered, r.open, r.provisional], [30, 1, 1, true]);
    assert.deepEqual(json.openIncidents, ["I2"]);
    assert.match(md, /I2/);
  });

  it("[DORA-01] incomplete incident classification prevents a definitive zero fail rate", () => {
    const e = clone();
    e.incidents = [];
    for (const d of e.deployments) Object.assign(d, { kind: "planned", triggeredByIncident: null });
    e.dataset.completeness.incidents = "partial";
    let m = ok(e).json.metrics;
    assert.equal(m.changeFailRate.rate, null);
    assert.ok(m.changeFailRate.reason);
    e.dataset.completeness.incidents = "complete";
    e.incidents = [incident({ immediateIntervention: null, restoredAt: "2026-01-07T13:10:00Z" })];
    m = ok(e).json.metrics;
    assert.equal(m.changeFailRate.rate, null, "an unclassified incident still allowed a definitive 0%");
  });

  it("[DORA-01] nonproduction deployments and failed-before-activation attempts never count", () => {
    const e = clone();
    e.deployments.push(deployment({ id: "S1", environment: "staging" }), deployment({ id: "P1", status: "failed-before-activation", activatedAt: null, commits: [{ sha: "c7c7c7c", committedAt: "2026-01-07T06:00:00Z" }] }));
    const m = ok(e).json.metrics;
    assert.equal(m.deploymentFrequency.deployments, 5);
    assert.equal(m.changeFailRate.deployments, 5);
    assert.equal(m.changeLeadTime.samples, 5);
  });

  it("[DORA-01] a failed applied deployment stays in the fail-rate numerator and denominator", () => {
    const e = clone();
    e.deployments.push(deployment({ status: "failed-after-activation" }));
    e.incidents.push(incident({ causedByDeployment: "D6" }));
    const m = ok(e).json.metrics;
    assert.deepEqual([m.changeFailRate.failedDeployments, m.changeFailRate.deployments], [3, 6]);
    assert.equal(m.changeLeadTime.samples, 5, "a failed deployment delivered its commit successfully");
  });

  it("[DORA-01] synthetic and real records never aggregate", () => {
    const e = clone();
    e.deployments[1].classification = "real";
    rejected(e, "a real deployment in a synthetic dataset");
  });

  it("[DORA-01] identical duplicates count once; contradictory duplicates are rejected", () => {
    const e = clone();
    e.deployments.push(structuredClone(e.deployments[1]));
    e.incidents.push(structuredClone(e.incidents[0]));
    const m = ok(e).json.metrics;
    assert.equal(m.deploymentFrequency.deployments, 5);
    assert.equal(m.changeFailRate.failedDeployments, 2);
    const c = clone();
    c.deployments.push({ ...structuredClone(c.deployments[1]), revision: "different" });
    rejected(c, "two deployments with one ID and different content");
  });

  it("[DORA-01] the window is half-open: from is included, to is excluded", () => {
    const e = clone();
    e.deployments.push(
      deployment({ id: "B1", activatedAt: "2026-01-01T00:00:00Z", commits: [{ sha: "b1b1b1b", committedAt: "2025-12-31T23:00:00Z" }] }),
      deployment({ id: "B2", activatedAt: "2026-01-11T00:00:00Z", commits: [{ sha: "b2b2b2b", committedAt: "2026-01-10T23:00:00Z" }] }),
    );
    const m = ok(e).json.metrics;
    assert.equal(m.deploymentFrequency.deployments, 6);
    assert.equal(m.changeLeadTime.samples, 6);
  });

  it("[DORA-01] a redeployed commit and a rollback count as deployments but not as new lead-time samples", () => {
    const e = clone();
    e.deployments.push(
      deployment({ id: "R1", activatedAt: "2026-01-08T12:00:00Z", commits: [{ sha: "c1c1c1c", committedAt: "2026-01-02T09:00:00Z" }] }),
      deployment({ id: "RB", activatedAt: "2026-01-09T12:00:00Z", revision: "r1", commits: [], kind: "unplanned" }),
    );
    const m = ok(e).json.metrics;
    assert.equal(m.deploymentFrequency.deployments, 7);
    assert.equal(m.changeLeadTime.samples, 5);
    assert.equal(m.changeLeadTime.medianHours, 3);
  });

  it("[DORA-01] recovery may end after the window; failures that began before it don't count", () => {
    const e = clone();
    e.incidents.push(
      incident({ id: "X1", causedByDeployment: "D1", failedAt: "2026-01-10T23:00:00Z", restoredAt: "2026-01-11T01:00:00Z" }),
      incident({ id: "X0", causedByDeployment: "D0", failedAt: "2025-12-31T23:00:00Z", restoredAt: "2026-01-01T05:00:00Z" }),
    );
    const r = ok(e).json.metrics.failedDeploymentRecoveryTime;
    assert.equal(r.recovered, 3);
    assert.equal(r.medianMinutes, 90);
  });

  it("[DORA-01] invalid times, negative durations and broken links are rejected", () => {
    let e = clone();
    e.deployments[1].activatedAt = "2026-01-02 10:00";
    rejected(e, "a non-ISO timestamp");
    e = clone();
    e.incidents[0].restoredAt = "2026-01-03T12:59:00Z";
    rejected(e, "a restoration before the failure");
    e = clone();
    e.deployments[1].commits[0].committedAt = "2026-01-02T11:00:00Z";
    rejected(e, "a commit made after its successful delivery");
    e = clone();
    e.incidents[0].causedByDeployment = "missing";
    rejected(e, "an incident caused by a deployment that doesn't exist");
    e = clone();
    e.deployments[2].service = "reservation";
    rejected(e, "an incident linked to another service's deployment");
    e = clone();
    e.deployments[3].triggeredByIncident = "missing";
    rejected(e, "a rework deployment linked to an incident that doesn't exist");
    e = clone();
    e.deployments[1].kind = "hotfix";
    rejected(e, "an invalid classification");
    assert.notEqual(calc(clone(), ["--from", "2026-01-11T00:00:00Z", "--to", "2026-01-01T00:00:00Z", "--service", "checkout", "--environment", "production"]).code, 0, "a backwards window was accepted");
  });

  it("[DORA-01] missing change history and missing classifications are visible, not silently excluded", () => {
    let e = clone();
    e.dataset.completeness.changeHistory = "partial";
    let m = ok(e).json.metrics;
    assert.equal(m.changeLeadTime.complete, false);
    assert.ok(m.changeLeadTime.reason, "incomplete lead-time coverage gives no reason");
    assert.equal(m.changeLeadTime.medianHours, 3);
    e = clone();
    e.deployments[3].kind = "unclassified";
    const r = ok(e).json;
    m = r.metrics;
    assert.deepEqual(r.unclassifiedDeployments, ["D3"]);
    assert.deepEqual([m.deploymentReworkRate.reworkDeployments, m.deploymentReworkRate.deployments, m.deploymentReworkRate.provisional], [1, 5, true]);
    e = clone();
    e.incidents = [];
    for (const d of e.deployments) Object.assign(d, { kind: "planned", triggeredByIncident: null });
    e.deployments[2].kind = "unclassified";
    m = ok(e).json.metrics;
    assert.equal(m.deploymentReworkRate.rate, null, "an unclassified deployment allowed a definitive 0% rework rate");
  });

  it("[DORA-01] a real dataset with no qualifying deployment reports every metric unavailable, even with in-window incidents", () => {
    const e = clone();
    e.dataset.classification = "real";
    e.deployments = [{ ...structuredClone(GOLDEN.deployments[0]), classification: "real" }];
    e.incidents = [incident({ classification: "real", causedByDeployment: "D0", failedAt: "2026-01-04T10:00:00Z", restoredAt: "2026-01-04T10:30:00Z" })];
    const { json, md } = ok(e);
    assert.equal(json.label, "NOT YET MEASURED");
    for (const [k, v] of Object.entries(json.metrics)) {
      const value = v.perDay ?? v.medianHours ?? v.rate ?? v.medianMinutes ?? null;
      assert.equal(value, null, `${k} reported a value for a NOT YET MEASURED dataset`);
    }
    assert.ok(!md.includes("30 minutes"), "Markdown shows a recovery time for a NOT YET MEASURED dataset");
  });

  it("[DORA-01] an in-window failure caused by an earlier deployment counts in recovery time, not in the fail rate", () => {
    const e = clone();
    e.incidents.push(incident({ id: "X2", causedByDeployment: "D0", failedAt: "2026-01-04T10:00:00Z", restoredAt: "2026-01-04T10:30:00Z" }));
    const m = ok(e).json.metrics;
    assert.deepEqual([m.changeFailRate.failedDeployments, m.changeFailRate.deployments], [2, 5]);
    assert.deepEqual([m.failedDeploymentRecoveryTime.recovered, m.failedDeploymentRecoveryTime.medianMinutes], [3, 30]);
  });

  it("[DORA-01] a failed-before-activation attempt never counts, even with a time inside the window", () => {
    const e = clone();
    e.deployments.push(deployment({ id: "P2", status: "failed-before-activation", activatedAt: "2026-01-07T12:00:00Z" }));
    const m = ok(e).json.metrics;
    assert.equal(m.deploymentFrequency.deployments, 5);
    assert.equal(m.changeFailRate.deployments, 5);
    assert.equal(m.changeLeadTime.samples, 5);
  });

  it("[DORA-01] impossible calendar times, contradictory incidents and missing recovery links are rejected", () => {
    let e = clone();
    e.deployments[1].activatedAt = "2026-02-30T10:00:00Z";
    rejected(e, "February 30");
    e = clone();
    e.incidents[0].restoredAt = "2026-01-03T24:00:00Z";
    rejected(e, "hour 24");
    e = clone();
    e.incidents.push({ ...structuredClone(e.incidents[0]), restoredAt: "2026-01-03T14:00:00Z" });
    rejected(e, "two incidents with one ID and different content");
    e = clone();
    e.incidents[0].recoveryDeployment = "missing";
    rejected(e, "a recovery deployment that doesn't exist");
  });

  it("[DORA-01] observation that ended before the window did makes results provisional", () => {
    const e = clone();
    e.dataset.observedTo = "2026-01-09T00:00:00Z";
    const m = ok(e).json.metrics;
    for (const k of Object.keys(m)) assert.equal(m[k].provisional, true, `${k} isn't provisional`);
  });

  it("[DORA-01] output cites its calculation version and input, and reproduces exactly", () => {
    const a = ok(clone());
    const b = ok(clone());
    assert.equal(a.json.calculationVersion, "dora-1");
    assert.equal(a.json.input.sha256, crypto.createHash("sha256").update(fs.readFileSync(a.input)).digest("hex"));
    assert.equal(a.json.generatedAt, "2026-01-20T00:00:00Z", "generatedAt must be the supplied clock");
    assert.deepEqual(a.json, b.json);
    assert.equal(a.md, b.md);
    assert.equal(outputs().length, 2, "a second run overwrote the first report");
  });

  it("[DORA-01] no individual ranking, score or causal claim appears", () => {
    const { json, md } = ok(clone());
    const text = JSON.stringify(json) + md;
    assert.ok(!text.includes("fixture-author"), "an author reached the report");
    assert.ok(!/"(score|confidence|author|rank)"/i.test(JSON.stringify(json)), "the report has a score, confidence, author or rank field");
    assert.ok(json.limitations.some((l) => /client value|AI|compliance/.test(l)), "limitations don't disclaim value, causality and compliance");
  });
});
