import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {createGuard} from "./guard.mjs";
export function freeze(root) {
const {manifestFor, listProtected, scanSkips, MANIFEST} = createGuard(JSON.parse(fs.readFileSync(path.join(root,"spec/guard/protected-paths.json"))));
// npm run guard:freeze — HUMAN ONLY. Records fingerprints of every protected file after
// a reviewed specification change. Agents must never run this (the Claude Code hook blocks it).



const skips = scanSkips(root);
if (skips.length) {
  console.error(`Refusing to freeze: skipped or focused tests found:\n${skips.map((s) => `  - ${s}`).join("\n")}`);
  process.exit(1);
}
fs.writeFileSync(path.join(root, MANIFEST), manifestFor(root));
console.log(`Froze ${listProtected(root).length} protected files into ${MANIFEST}. Commit it with the reviewed change.`);
}
