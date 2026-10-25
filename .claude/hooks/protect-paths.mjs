#!/usr/bin/env node
// Claude Code PreToolUse hook (GUARD-01). Blocks agent writes to protected specs and tests.
// The reason is shown to the user and returned to the agent. The guard check
// (npm --prefix spec run guard:check) is the backstop for anything this misses.
import fs from "node:fs";
import path from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(projectDir, "spec/guard/protected-paths.json"), "utf8"));
const PROTECTED = config.protected; // e.g. "spec/", "AGENTS.md"

let input = {};
try { input = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch { process.exit(0); }
const tool = input.tool_name ?? "";
const args = input.tool_input ?? {};

const REASON = (what) => `Blocked by GUARD-01: ${what}. Protected files are the specification `
  + "and tests that define correct behavior; humans change them deliberately. Change the implementation "
  + "under unprotected implementation paths instead. If you believe the specification is wrong, stop and explain the "
  + "problem to the user rather than editing it.";

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  }));
  process.exit(0);
}

const isProtected = (rel) => PROTECTED.some((p) => (p.endsWith("/") ? rel === p.slice(0, -1) || rel.startsWith(p) : rel === p));

if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
  const target = args.file_path ?? args.notebook_path ?? args.path;
  if (target) {
    const rel = path.relative(projectDir, path.resolve(projectDir, target)).split(path.sep).join("/");
    if (!rel.startsWith("..") && isProtected(rel)) deny(REASON(`${rel} is protected`));
  }
  process.exit(0);
}

if (tool === "Bash") {
  const cmd = String(args.command ?? "");
  if (/guard:freeze|guard\/freeze\.(?:mjs|js)/.test(cmd)) {
    deny("Blocked by GUARD-01: only a human may run guard:freeze, after reviewing a specification change.");
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pathRe = new RegExp(`(^|[\\s'"=:(])(\\./)?(${PROTECTED.map(esc).join("|")})`);
  const redirectRe = new RegExp(`>>?\\s*['"]?(\\./)?(${PROTECTED.map(esc).join("|")})`);
  const writeVerb = /(^|[\s;&|(])(rm|mv|cp|tee|truncate|touch|chmod|chown|ln|unlink|dd|install|rsync)\s|\bsed\s+(-[a-zA-Z]*i|--in-place)|\bperl\s+-[a-zA-Z]*i|\bgit\s+(checkout|restore|reset|clean|rm|mv|stash|apply|am|revert|update-index)\b|\bwriteFile(Sync)?\b|\bopen\([^)]*['"][wa]/;
  if (redirectRe.test(cmd) || (pathRe.test(cmd) && writeVerb.test(cmd))) {
    deny(REASON("this shell command would write to a protected path"));
  }
}
process.exit(0);
