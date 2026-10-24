import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {createGuard} from "./guard.mjs";
export function check(root) {
const {compare, scanSkips, scanTags, MANIFEST} = createGuard(JSON.parse(fs.readFileSync(path.join(root,"spec/guard/protected-paths.json"))));
// npm run guard:check — fails if any protected file changed since the last human freeze,
// if a test has been skipped, or if an @accepted-risk/@retired tag is invalid or expired
// (SPEC-07). Prints the accepted-risk register on every run. Protected scaffolding.



const manifestPath = path.join(root, MANIFEST);
if (!fs.existsSync(manifestPath)) {
  console.error(`GUARD FAIL: ${MANIFEST} is missing. A human must run: npm --prefix spec run guard:freeze`);
  process.exit(1);
}
const { modified, missing, added } = compare(root, fs.readFileSync(manifestPath, "utf8"));
const skips = scanSkips(root);
const tags = scanTags(root);

if (tags.register.length) {
  console.log(`Accepted risks (${tags.register.length}) — expected to fail; run in the accepted-risks suite:`);
  for (const r of tags.register) {
    console.log(`  - ${r.risk}${r.source ? ` (${r.source})` : ""}  owner ${r.owner}  review ${r.review}  ${r.file}:${r.line}`);
  }
}
for (const w of tags.warnings) console.log(`GUARD WARNING: ${w}`);

const report = [
  ["Modified protected files", modified],
  ["Deleted protected files", missing],
  ["New files in protected paths", added],
  ["Skipped or focused tests", skips],
  ["Invalid or expired @accepted-risk/@retired tags", tags.errors],
].filter(([, list]) => list.length);

if (!report.length) {
  console.log("GUARD PASS: protected specs and tests match the frozen manifest; no skipped tests; risk and retirement tags valid.");
  process.exit(0);
}
console.error("GUARD FAIL: protected specs or tests changed.\n");
for (const [title, list] of report) console.error(`${title}:\n${list.map((f) => `  - ${f}`).join("\n")}\n`);
console.error("Protected files define correct behavior. Change the implementation, not the spec.\n"
  + "If the specification itself should change, a human reviews the diff and runs: npm --prefix spec run guard:freeze");
process.exit(1);
}
