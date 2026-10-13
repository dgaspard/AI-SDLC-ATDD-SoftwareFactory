// DORA-01 local slice: the five DORA metrics for one service and environment over one window, from
// supplied events. Counting rules: spec/delivery/dora.md (calculation version dora-1). Contracts:
// spec/delivery/contracts/dora-{events,metrics}.v1.schema.json. Tests: spec/tests/dora/.
//
//   node tools/dora/dora-metrics.mjs --input <events.json> --from <UTC> --to <UTC>
//        --service <id> --environment <name> [--now <UTC>]
//
// Writes test-results/dora/<id>/dora-metrics.{json,md}. Exits 0 when a report is written, 2 when
// the arguments or input are invalid (and then writes nothing). Offline: no network, no
// credentials; loading events is the adapter boundary for later GitHub, cloud and incident data.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CALCULATION = "dora-1";
const MAX_INPUT = 16 * 1024 * 1024;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const SHA = /^[0-9a-f]{7,40}$/;
const DAY = 86_400_000;
const LABELS = {
  synthetic: "SYNTHETIC — MEASUREMENT DEMONSTRATION",
  empty: "NOT YET MEASURED",
  real: "MEASURED",
};

class InputError extends Error {}
const fail = (msg) => {
  throw new InputError(msg);
};

// ---------- arguments ----------

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
/** ISO 8601 UTC that names a real instant: Date.parse rolls 2026-02-30 and 24:00 over, so round-trip. */
const isTime = (s) =>
  typeof s === "string" &&
  TIME.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(Date.parse(s)).toISOString().slice(0, 19) === s.slice(0, 19);
const ms = (s) => Date.parse(s);

function args() {
  const a = {
    input: opt("--input"),
    from: opt("--from"),
    to: opt("--to"),
    service: opt("--service"),
    environment: opt("--environment"),
    now: opt("--now") ?? new Date().toISOString(),
  };
  for (const k of ["input", "service", "environment"])
    if (!a[k]) fail(`--${k} is required`);
  for (const k of ["from", "to", "now"])
    if (!isTime(a[k]))
      fail(`--${k} must be an ISO 8601 UTC time, got "${a[k]}"`);
  if (ms(a.to) <= ms(a.from)) fail("--to must be after --from");
  return a;
}

// ---------- validation ----------

const enumOf = (v, values, where) =>
  values.includes(v) ? v : fail(`${where} must be one of ${values.join(", ")}`);
const time = (v, where) =>
  isTime(v) ? v : fail(`${where} must be an ISO 8601 UTC time`);
const timeOrNull = (v, where) => (v === null ? null : time(v, where));
const text = (v, where) =>
  typeof v === "string" && v.length > 0
    ? v
    : fail(`${where} must be a non-empty string`);
const idOrNull = (v, where) => (v === null ? null : text(v, where));
const object = (v, where) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? v
    : fail(`${where} must be an object`);

/** Stable JSON so identical duplicates compare equal regardless of key order. */
const canonical = (v) =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(",")}}`
      : JSON.stringify(v);

/** Identical duplicates count once; the same ID with different content rejects the input. */
function unique(records, what) {
  const byId = new Map();
  for (const r of records) {
    const seen = byId.get(r.id);
    if (!seen) byId.set(r.id, r);
    else if (canonical(seen) !== canonical(r))
      fail(`${what} ${r.id} appears twice with different content`);
  }
  return [...byId.values()];
}

function validate(doc) {
  object(doc, "input");
  if (doc.schemaVersion !== 1 || doc.kind !== "dora-events")
    fail("input is not a dora-events v1 document");
  const ds = object(doc.dataset, "dataset");
  const classification = enumOf(
    ds.classification,
    ["synthetic", "real"],
    "dataset.classification",
  );
  const completeness = object(ds.completeness, "dataset.completeness");
  for (const k of ["deployments", "incidents", "changeHistory"]) {
    enumOf(
      completeness[k],
      ["complete", "partial", "unknown"],
      `dataset.completeness.${k}`,
    );
  }
  const dataset = {
    source: text(ds.source, "dataset.source"),
    classification,
    observedFrom: time(ds.observedFrom, "dataset.observedFrom"),
    observedTo: time(ds.observedTo, "dataset.observedTo"),
    completeness: {
      deployments: completeness.deployments,
      incidents: completeness.incidents,
      changeHistory: completeness.changeHistory,
    },
    completenessSource: text(
      ds.completenessSource,
      "dataset.completenessSource",
    ),
  };
  if (!Array.isArray(doc.deployments) || !Array.isArray(doc.incidents))
    fail("deployments and incidents must be arrays");
  const sameClass = (r, where) => {
    if (r.classification !== classification)
      fail(
        `${where} is ${r.classification}, the dataset is ${classification}; they never aggregate`,
      );
  };

  const deployments = unique(
    doc.deployments.map((d, i) => {
      const where = `deployments[${i}]`;
      object(d, where);
      sameClass(d, `deployment ${d.id}`);
      const status = enumOf(
        d.status,
        ["succeeded", "failed-after-activation", "failed-before-activation"],
        `${where}.status`,
      );
      const activatedAt = timeOrNull(d.activatedAt, `${where}.activatedAt`);
      if (status !== "failed-before-activation" && activatedAt === null)
        fail(`${where} changed the running service but has no activatedAt`);
      if (!Array.isArray(d.commits)) fail(`${where}.commits must be an array`);
      const commits = d.commits.map((c, j) => {
        object(c, `${where}.commits[${j}]`);
        if (!SHA.test(c.sha ?? ""))
          fail(`${where}.commits[${j}].sha must be a hex commit hash`);
        return {
          sha: c.sha,
          committedAt: time(
            c.committedAt,
            `${where}.commits[${j}].committedAt`,
          ),
        };
      });
      if (status === "succeeded") {
        for (const c of commits)
          if (ms(c.committedAt) > ms(activatedAt))
            fail(
              `commit ${c.sha} was made after deployment ${d.id} delivered it`,
            );
      }
      return {
        id: text(d.id, `${where}.id`),
        classification: d.classification,
        service: text(d.service, `${where}.service`),
        environment: text(d.environment, `${where}.environment`),
        status,
        activatedAt,
        revision: text(d.revision, `${where}.revision`),
        commits,
        kind: enumOf(
          d.kind,
          ["planned", "unplanned", "unclassified"],
          `${where}.kind`,
        ),
        triggeredByIncident: idOrNull(
          d.triggeredByIncident,
          `${where}.triggeredByIncident`,
        ),
        evidence:
          d.evidence === null || typeof d.evidence === "string"
            ? d.evidence
            : fail(`${where}.evidence must be a string or null`),
      };
    }),
    "deployment",
  );

  const incidents = unique(
    doc.incidents.map((n, i) => {
      const where = `incidents[${i}]`;
      object(n, where);
      sameClass(n, `incident ${n.id}`);
      const failedAt = time(n.failedAt, `${where}.failedAt`);
      const restoredAt = timeOrNull(n.restoredAt, `${where}.restoredAt`);
      if (restoredAt && ms(restoredAt) < ms(failedAt))
        fail(`incident ${n.id} was restored before it failed`);
      if (![true, false, null].includes(n.immediateIntervention))
        fail(`${where}.immediateIntervention must be true, false or null`);
      return {
        id: text(n.id, `${where}.id`),
        classification: n.classification,
        service: text(n.service, `${where}.service`),
        environment: text(n.environment, `${where}.environment`),
        causedByDeployment: text(
          n.causedByDeployment,
          `${where}.causedByDeployment`,
        ),
        failedAt,
        restoredAt,
        immediateIntervention: n.immediateIntervention,
        recoveryDeployment: idOrNull(
          n.recoveryDeployment,
          `${where}.recoveryDeployment`,
        ),
      };
    }),
    "incident",
  );

  const depById = new Map(deployments.map((d) => [d.id, d]));
  const incIds = new Set(incidents.map((n) => n.id));
  for (const n of incidents) {
    const d = depById.get(n.causedByDeployment);
    if (!d)
      fail(
        `incident ${n.id} names deployment ${n.causedByDeployment}, which isn't in the input`,
      );
    if (d.service !== n.service || d.environment !== n.environment)
      fail(
        `incident ${n.id} is linked to deployment ${d.id} of another service or environment`,
      );
    if (n.recoveryDeployment && !depById.has(n.recoveryDeployment))
      fail(
        `incident ${n.id} names recovery deployment ${n.recoveryDeployment}, which isn't in the input`,
      );
  }
  for (const d of deployments) {
    if (d.triggeredByIncident && !incIds.has(d.triggeredByIncident))
      fail(
        `deployment ${d.id} names incident ${d.triggeredByIncident}, which isn't in the input`,
      );
  }
  return { dataset, deployments, incidents };
}

// ---------- calculation (spec/delivery/dora.md) ----------

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x, places = 4) => Math.round(x * 10 ** places) / 10 ** places;

function calculate({ dataset, deployments, incidents }, a) {
  const from = ms(a.from);
  const to = ms(a.to);
  const inWindow = (t) => t !== null && ms(t) >= from && ms(t) < to;
  const ours = (r) =>
    r.service === a.service && r.environment === a.environment;
  const days = (to - from) / DAY;
  const observedShort = ms(dataset.observedTo) < to;
  const c = dataset.completeness;

  const applied = deployments.filter(
    (d) => ours(d) && d.status !== "failed-before-activation",
  );
  const qualifying = applied.filter((d) => inWindow(d.activatedAt));
  const qIds = new Set(qualifying.map((d) => d.id));
  const n = qualifying.length;
  const none = "no qualifying deployments in the window";

  const deploymentFrequency = {
    perDay: n ? round(n / days) : null,
    deployments: n,
    days: round(days),
    reason: n ? null : none,
    provisional: observedShort || c.deployments !== "complete",
  };

  // Lead time: first successful delivery of each commit, at any time, counted once.
  const first = new Map();
  for (const d of applied
    .filter((x) => x.status === "succeeded")
    .sort((x, y) => ms(x.activatedAt) - ms(y.activatedAt))) {
    for (const cm of d.commits)
      if (!first.has(cm.sha))
        first.set(cm.sha, { at: d.activatedAt, committedAt: cm.committedAt });
  }
  const leads = [...first.values()]
    .filter((f) => inWindow(f.at))
    .map((f) => (ms(f.at) - ms(f.committedAt)) / 3_600_000);
  const historyComplete =
    c.changeHistory === "complete" && c.deployments === "complete";
  const changeLeadTime = {
    medianHours: leads.length ? round(median(leads)) : null,
    samples: leads.length,
    complete: historyComplete,
    reason: !leads.length
      ? "no commits were first delivered in the window"
      : historyComplete
        ? null
        : `change history is ${c.changeHistory}: some commits may have been delivered earlier, so coverage is incomplete`,
    provisional: observedShort || !historyComplete,
  };

  // Change fail rate: distinct qualifying deployments with an immediate-intervention failure.
  const onQualifying = incidents.filter(
    (x) => ours(x) && qIds.has(x.causedByDeployment),
  );
  const failed = new Set(
    onQualifying
      .filter((x) => x.immediateIntervention === true)
      .map((x) => x.causedByDeployment),
  );
  const unknownIncidents = onQualifying.filter(
    (x) => x.immediateIntervention === null,
  ).length;
  const incidentsIncomplete =
    c.incidents !== "complete" || unknownIncidents > 0;
  const definitiveZeroBlocked = failed.size === 0 && incidentsIncomplete;
  const changeFailRate = {
    rate: n && !definitiveZeroBlocked ? round(failed.size / n) : null,
    failedDeployments: failed.size,
    deployments: n,
    reason: !n
      ? none
      : definitiveZeroBlocked
        ? "incident classification is incomplete, so a 0% rate can't be claimed"
        : null,
    provisional:
      observedShort || incidentsIncomplete || c.deployments !== "complete",
  };

  // Recovery time: deployment-caused immediate-intervention failures that began in the window.
  const failures = incidents.filter(
    (x) => ours(x) && x.immediateIntervention === true && inWindow(x.failedAt),
  );
  const recovered = failures.filter((x) => x.restoredAt);
  const open = failures.filter((x) => !x.restoredAt);
  // A real dataset with no qualifying deployment is NOT YET MEASURED: every metric is
  // unavailable, even when an earlier deployment caused a failure in the window.
  const notYetMeasured = dataset.classification === "real" && !n;
  const failedDeploymentRecoveryTime = {
    medianMinutes:
      recovered.length && !notYetMeasured
        ? round(
            median(
              recovered.map(
                (x) => (ms(x.restoredAt) - ms(x.failedAt)) / 60_000,
              ),
            ),
          )
        : null,
    recovered: recovered.length,
    open: open.length,
    reason: notYetMeasured
      ? `NOT YET MEASURED: ${none}`
      : recovered.length
        ? null
        : "no deployment-caused failure in the window has recovered",
    provisional: observedShort || open.length > 0 || c.incidents !== "complete",
  };

  // Rework rate: unplanned deployments responding to a production incident.
  const rework = qualifying.filter(
    (d) => d.kind === "unplanned" && d.triggeredByIncident,
  ).length;
  const unclassified = qualifying
    .filter((d) => d.kind === "unclassified")
    .map((d) => d.id)
    .sort();
  const reworkZeroBlocked = rework === 0 && unclassified.length > 0;
  const deploymentReworkRate = {
    rate: n && !reworkZeroBlocked ? round(rework / n) : null,
    reworkDeployments: rework,
    deployments: n,
    reason: !n
      ? none
      : reworkZeroBlocked
        ? "some deployments are unclassified, so a 0% rate can't be claimed"
        : null,
    provisional:
      observedShort || unclassified.length > 0 || c.deployments !== "complete",
  };

  const label =
    dataset.classification === "synthetic"
      ? LABELS.synthetic
      : n
        ? LABELS.real
        : LABELS.empty;
  const limitations = [
    `This measures the supplied records only. Completeness comes from the dataset (source: "${dataset.completenessSource}"); the calculator reports it but doesn't prove it.`,
    "These are delivery-performance measures. They don't demonstrate client value, AI causality or compliance.",
  ];
  if (dataset.classification === "synthetic")
    limitations.unshift(
      "Synthetic data: a measurement demonstration, not delivery results.",
    );
  if (observedShort)
    limitations.push(
      "Observation ended before the window did; results are provisional and later incidents may change them.",
    );

  return {
    label,
    scope: {
      service: a.service,
      environment: a.environment,
      from: a.from,
      to: a.to,
      days: round(days),
    },
    metrics: {
      deploymentFrequency,
      changeLeadTime,
      changeFailRate,
      failedDeploymentRecoveryTime,
      deploymentReworkRate,
    },
    openIncidents: incidents
      .filter((x) => ours(x) && !x.restoredAt)
      .map((x) => x.id)
      .sort(),
    unclassifiedDeployments: unclassified,
    limitations,
  };
}

// ---------- rendering ----------

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]|!])/g, "\\$1")
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ");
const num = (x) => String(round(x, 2));
const pct = (x) => `${round(x * 100, 1)}%`;

function markdown(r) {
  const m = r.metrics;
  const status = (x) => (x.provisional ? "provisional" : "final");
  const value = (x, show) => (x === null ? "not available" : show(x));
  const why = (x) => (x.reason ? ` (${esc(x.reason)})` : "");
  const L = [];
  L.push(
    `# DORA metrics: ${esc(r.scope.service)} (${esc(r.scope.environment)})`,
    "",
  );
  L.push(`**${r.label}**`, "");
  L.push(
    `Window ${esc(r.scope.from)} to ${esc(r.scope.to)} (${num(r.scope.days)} days) · calculation ${r.calculationVersion} · generated ${esc(r.generatedAt)}`,
  );
  L.push(
    `Input sha256 \`${r.input.sha256}\` · source: ${esc(r.input.source)}`,
    "",
  );
  L.push("| Metric | Value | Basis | Status |", "| --- | --- | --- | --- |");
  const df = m.deploymentFrequency;
  L.push(
    `| Deployment frequency | ${value(df.perDay, (v) => `${num(v)} deployments/day`)}${why(df)} | ${df.deployments} deployments in ${num(df.days)} days | ${status(df)} |`,
  );
  const lt = m.changeLeadTime;
  L.push(
    `| Change lead time (median) | ${value(lt.medianHours, (v) => `${num(v)} hours`)}${why(lt)} | ${lt.samples} commits; change history ${lt.complete ? "complete" : "incomplete"} | ${status(lt)} |`,
  );
  const cf = m.changeFailRate;
  L.push(
    `| Change fail rate | ${value(cf.rate, pct)}${why(cf)} | ${cf.failedDeployments} of ${cf.deployments} deployments | ${status(cf)} |`,
  );
  const rt = m.failedDeploymentRecoveryTime;
  L.push(
    `| Failed deployment recovery time (median) | ${value(rt.medianMinutes, (v) => `${num(v)} minutes`)}${why(rt)} | ${rt.recovered} recovered, ${rt.open} open | ${status(rt)} |`,
  );
  const rw = m.deploymentReworkRate;
  L.push(
    `| Deployment rework rate | ${value(rw.rate, pct)}${why(rw)} | ${rw.reworkDeployments} of ${rw.deployments} deployments | ${status(rw)} |`,
    "",
  );
  L.push(
    `Open incidents: ${r.openIncidents.length ? r.openIncidents.map(esc).join(", ") : "none"}.`,
  );
  L.push(
    `Unclassified deployments: ${r.unclassifiedDeployments.length ? r.unclassifiedDeployments.map(esc).join(", ") : "none"}.`,
    "",
  );
  const comp = r.input.completeness;
  L.push("## Completeness", "");
  L.push(
    `Deployments ${comp.deployments}, incidents ${comp.incidents}, change history ${comp.changeHistory}. Source: ${esc(r.input.completenessSource)}. Observed to ${esc(r.input.observedTo)}.`,
    "",
  );
  L.push("## Limitations", "");
  for (const l of r.limitations) L.push(`- ${esc(l)}`);
  return L.join("\n") + "\n";
}

// ---------- main ----------

function write(report, a, sha) {
  const out = path.join(process.cwd(), "test-results", "dora");
  fs.mkdirSync(out, { recursive: true });
  const safe = a.service.replace(/[^0-9A-Za-z._-]/g, "_").slice(0, 60);
  const base = `${safe}-${a.from.replace(/[:.]/g, "-")}-${sha.slice(0, 8)}`;
  let id = base;
  for (let n = 2; fs.existsSync(path.join(out, id)); n++) id = `${base}-${n}`;
  const tmp = fs.mkdtempSync(path.join(out, ".tmp-"));
  try {
    fs.writeFileSync(
      path.join(tmp, "dora-metrics.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    fs.writeFileSync(path.join(tmp, "dora-metrics.md"), markdown(report));
    fs.renameSync(tmp, path.join(out, id));
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
  return path.join(out, id);
}

try {
  const a = args();
  let stat;
  try {
    stat = fs.statSync(a.input);
  } catch {
    fail(`${a.input} is not a readable input file`);
  }
  if (!stat.isFile() || stat.size > MAX_INPUT)
    fail(`${a.input} is not a readable input file`);
  const raw = fs.readFileSync(a.input);
  let doc;
  try {
    doc = JSON.parse(raw.toString("utf8"));
  } catch {
    fail("input is not JSON");
  }
  const events = validate(doc);
  const sha = crypto.createHash("sha256").update(raw).digest("hex");
  const calc = calculate(events, a);
  const report = {
    schemaVersion: 1,
    kind: "dora-metrics",
    calculationVersion: CALCULATION,
    generatedAt: a.now,
    label: calc.label,
    input: {
      sha256: sha,
      source: events.dataset.source,
      classification: events.dataset.classification,
      observedTo: events.dataset.observedTo,
      completeness: events.dataset.completeness,
      completenessSource: events.dataset.completenessSource,
    },
    scope: calc.scope,
    metrics: calc.metrics,
    openIncidents: calc.openIncidents,
    unclassifiedDeployments: calc.unclassifiedDeployments,
    limitations: calc.limitations,
  };
  const dir = write(report, a, sha);
  console.log(
    `${report.label}: ${a.service} (${a.environment}) ${a.from} to ${a.to}`,
  );
  console.log(path.relative(process.cwd(), path.join(dir, "dora-metrics.md")));
  console.log(
    path.relative(process.cwd(), path.join(dir, "dora-metrics.json")),
  );
} catch (error) {
  console.error(
    `dora: ${error instanceof InputError ? error.message : error.stack}`,
  );
  process.exit(2);
}
