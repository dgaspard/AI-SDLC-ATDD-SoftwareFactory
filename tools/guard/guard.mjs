import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function createGuard(configuration) {
// Guard for protected specs and tests (GUARD-01). Fingerprints every protected file
// and scans tests for skip/only markers. Protected scaffolding.

const CONFIG = configuration;
const MANIFEST = "spec/protected.sha256";

const isIgnored = (rel) => CONFIG.ignored.some((i) => (i.endsWith("/") ? rel.split("/").includes(i.slice(0, -1)) : rel === i || rel.endsWith(`/${i}`)));

/** Repo-relative paths of every protected file under root, sorted. */
function listProtected(root) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs) || isIgnored(rel)) return;
    const st = fs.lstatSync(abs);
    if (st.isDirectory()) for (const e of fs.readdirSync(abs)) walk(rel ? `${rel}/${e}` : e);
    else if (st.isFile()) out.push(rel);
  };
  for (const p of CONFIG.protected) walk(p.replace(/\/$/, ""));
  return [...new Set(out)].sort();
}

function manifestFor(root) {
  return listProtected(root)
    .map((rel) => `${crypto.createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex")}  ${rel}`)
    .join("\n") + "\n";
}

function parse(text) {
  const map = new Map();
  for (const line of text.split("\n").filter(Boolean)) {
    const m = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
    if (m) map.set(m[2], m[1]);
  }
  return map;
}

/** Compares current files with a manifest; returns { modified, missing, added }. */
function compare(root, manifestText) {
  const expected = parse(manifestText);
  const actual = parse(manifestFor(root));
  return {
    modified: [...expected].filter(([f, h]) => actual.has(f) && actual.get(f) !== h).map(([f]) => f),
    missing: [...expected.keys()].filter((f) => !actual.has(f)),
    added: [...actual.keys()].filter((f) => !expected.has(f)),
  };
}

// SPEC-07: any skip/focus/todo mechanism in protected code, whatever its value or receiver.
// The old literal-only match ({ skip: true }) let `skip: someCondition` through.
const SKIP_CODE = [
  /\.(?:skip|only|todo|fixme)\s*\(/,       // it.skip(, t.skip(, this.skip(, test.fixme(
  /(?<![\w-])(?:skip|only|todo)\s*:/,      // { skip: anything }, but not prose like "Administrator-only:"
  /return\s+["'](?:skipped|pending)["']/,  // Cucumber step/hook escape hatches
];
const SKIP_TAG = /(^|\s)@(?:skip|wip|ignore|only|todo|pending|manual|disabled)\b/;
const COMMENT = { js: /^\s*(?:\/\/|\/\*|\*)/, feature: /^\s*#/ };
const SCANNED = ["spec/tests/", "spec/features/", "spec/harness/"];

/** Finds skip/only markers in spec tests, harness, and features; returns ["file:line text"]. */
function scanSkips(root) {
  const hits = [];
  for (const rel of listProtected(root).filter((f) => SCANNED.some((p) => f.startsWith(p)))) {
    const isFeature = rel.endsWith(".feature");
    if (!isFeature && !rel.endsWith(".js")) continue;
    fs.readFileSync(path.join(root, rel), "utf8").split("\n").forEach((line, i) => {
      if ((isFeature ? COMMENT.feature : COMMENT.js).test(line)) return;
      const hit = isFeature ? SKIP_TAG.test(line) : SKIP_CODE.some((re) => re.test(line));
      if (hit) hits.push(`${rel}:${i + 1} ${line.trim()}`);
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// SPEC-07: @accepted-risk and @retired tags
// ---------------------------------------------------------------------------
const KEYWORD = /^\s*(Feature|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples):/;
const SCENARIO_LEVEL = new Set(["Scenario", "Scenario Outline", "Scenario Template", "Example"]);
const DECISIONS = "docs/specs/business-decisions.md";
const REVIEWS = "docs/engineering-reviews/";
const REVIEW_WARNING_DAYS = 14;

/** Tagged elements of a feature file: [{ keyword, name, line, tags: ["@a", ...] }]. */
function taggedElements(text) {
  const out = [];
  let pending = [];
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    if (t.startsWith("@")) { pending.push(...t.split(/\s+/).filter((x) => x.startsWith("@"))); return; }
    const m = line.match(KEYWORD);
    if (m) out.push({ keyword: m[1], name: line.slice(line.indexOf(":") + 1).trim(), line: i + 1, tags: pending });
    pending = [];
  });
  return out;
}

const values = (tags, prefix) => tags.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));

/**
 * Validates every @accepted-risk / @retired tag in protected features against today's date.
 * Returns { errors, warnings, register }: errors fail the guard; register lists every
 * accepted risk so each run shows it.
 */
function scanTags(root, today = process.env.GUARD_TODAY ?? new Date().toISOString().slice(0, 10)) {
  const errors = [], warnings = [], register = [];
  const read = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), "utf8") : "");
  const decisions = read(DECISIONS);
  const hasDecision = (id) => new RegExp(`^\\|\\s*${id}\\s*\\|`, "m").test(decisions);

  for (const rel of listProtected(root).filter((f) => f.startsWith("spec/features/") && f.endsWith(".feature"))) {
    for (const el of taggedElements(read(rel))) {
      const where = `${rel}:${el.line} ${el.keyword}: ${el.name}`;
      const err = (msg) => errors.push(`${where} — ${msg}`);
      const risk = el.tags.includes("@accepted-risk"), retired = el.tags.includes("@retired");
      const meta = ["@risk:", "@source:", "@owner:", "@review:", "@decision:"].filter((p) => values(el.tags, p).length);
      if (!risk && !retired) {
        if (meta.length) err(`${meta.join(", ")} used without @accepted-risk or @retired`);
        continue;
      }
      if (!SCENARIO_LEVEL.has(el.keyword)) { err("@accepted-risk/@retired belong on a single scenario, not a whole " + el.keyword); continue; }
      if (risk && retired) { err("a scenario cannot be both @accepted-risk and @retired"); continue; }

      if (retired) {
        const d = values(el.tags, "@decision:");
        if (d.length !== 1) err("@retired needs exactly one @decision:D-nn");
        else if (!/^D-\d+$/.test(d[0]) || !hasDecision(d[0])) err(`@decision:${d[0]} is not a decision in ${DECISIONS}`);
        const extra = meta.filter((p) => p !== "@decision:");
        if (extra.length) err(`${extra.join(", ")} not allowed on @retired`);
        continue;
      }

      const one = (prefix) => {
        const v = values(el.tags, prefix);
        if (v.length !== 1) { err(`@accepted-risk needs exactly one ${prefix}`); return null; }
        return v[0];
      };
      const id = one("@risk:"), owner = one("@owner:"), review = one("@review:");
      const sources = values(el.tags, "@source:");
      if (values(el.tags, "@decision:").length) err("@decision: is for @retired; use @risk: on @accepted-risk");
      let source = null;
      if (id && /^D-\d+$/.test(id)) {
        if (!hasDecision(id)) err(`@risk:${id} is not a decision in ${DECISIONS}`);
        if (sources.length) err("@source: is only for REV- risks");
      } else if (id && /^REV-\d+$/.test(id)) {
        if (sources.length !== 1) err(`@risk:${id} needs exactly one @source:<file in ${REVIEWS}, without .md>`);
        else {
          source = sources[0];
          const text = read(`${REVIEWS}${source}.md`);
          if (!text) err(`@source:${source} — no file ${REVIEWS}${source}.md`);
          else if (!new RegExp(`\\b${id}\\b`).test(text)) err(`${id} not found in ${REVIEWS}${source}.md`);
        }
      } else if (id) err(`@risk:${id} must be D-nn or REV-nnn`);

      if (review) {
        const date = new Date(`${review}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(review) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== review) {
          err(`@review:${review} is not a valid YYYY-MM-DD date`);
        } else {
          const days = Math.round((date - new Date(`${today}T00:00:00Z`)) / 86400000);
          if (days < 0) err(`accepted risk ${id} expired on ${review} (owner ${owner}); review it, then re-freeze with a new date or remove the scenario's tag`);
          else if (days <= REVIEW_WARNING_DAYS) warnings.push(`${where} — accepted risk ${id} is due for review on ${review} (${days} days, owner ${owner})`);
        }
      }
      register.push({ file: rel, line: el.line, scenario: el.name, risk: id, source, owner, review });
    }
  }
  return { errors, warnings, register };
}
return {CONFIG, MANIFEST, listProtected, manifestFor, compare, scanSkips, REVIEW_WARNING_DAYS, taggedElements, scanTags};
}
