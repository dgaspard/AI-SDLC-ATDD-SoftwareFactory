// REVIEW-02 (A-29): the review policy and the approver identity.
// Static steps read review-policy.json and the protected-path lists, offline. Live steps
// read GitHub settings with `gh api` GETs only (A-13), like live.steps.js.
import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import * as repo from "./support/repo.js";

const none = (rule, items) => assert.deepEqual(items, [], `${rule}: ${items.join("; ")}`);
const POLICY_FILE = "spec/delivery/review-policy.json";

// The reference classification. A change's class is the most restrictive class any of
// its paths falls in; a path no class names falls in the policy's unmatched class.
function classOf(policy, file) {
  const matches = policy.classes.filter(
    (c) =>
      (c.prefixes ?? []).some((p) => file.startsWith(p)) ||
      (c.files ?? []).includes(file) ||
      (c.basenames ?? []).includes(path.posix.basename(file)),
  );
  if (matches.length === 0) return policy.classes.find((c) => c.id === policy.unmatchedClass);
  return matches.find((c) => !c.approverMayApprove) ?? matches[0];
}
export const approvable = (policy, files) => files.length > 0 && files.every((f) => classOf(policy, f)?.approverMayApprove === true);

Given("the review policy", function () {
  assert.ok(repo.exists(POLICY_FILE), `CTL-062: ${POLICY_FILE} is missing`);
  this.policy = JSON.parse(repo.read(POLICY_FILE));
  assert.equal(this.policy.schema, "review-policy/1", "CTL-062: unknown review policy schema");
  assert.ok(Array.isArray(this.policy.classes) && this.policy.classes.length > 0, "CTL-062: the review policy has no classes");
  const unmatched = this.policy.classes.find((c) => c.id === this.policy.unmatchedClass);
  assert.ok(unmatched, `CTL-062: unmatched class ${this.policy.unmatchedClass} is not defined`);
});

// A directory entry like "spec/" stands for a file inside it.
const sample = (p) => (p.endsWith("/") ? `${p}x` : p);

Then("every protected path and every root-of-trust path is in a class the approver may not approve", function () {
  const guard = JSON.parse(repo.read("spec/guard/protected-paths.json")).protected ?? [];
  assert.ok(guard.length > 0, "CTL-062: spec/guard/protected-paths.json lists no protected paths");
  const paths = [...guard, ...repo.rootOfTrust.paths];
  none("CTL-062 approver may approve a protected path", paths.filter((p) => approvable(this.policy, [sample(p)])));
});

Then("the review policy, the agent wrapper and every workflow are in a class the approver may not approve", function () {
  const own = [POLICY_FILE, "tools/github/agent.mjs", ".github/workflows/guard.yml", ".github/workflows/review-policy.yml", ".github/workflows/delivery-x.yml"];
  none("CTL-062 approver may approve its own machinery", own.filter((p) => approvable(this.policy, [p])));
});

Then("a path no class names is in a class the approver may not approve", function () {
  const unnamed = "an-unlisted-folder/file.txt";
  assert.ok(!approvable(this.policy, [unnamed]), "CTL-062: the approver may approve a path no class names");
});

Then("a change that touches any path the approver may not approve can't be approved", function () {
  const mayApprove = this.policy.classes.filter((c) => c.approverMayApprove);
  const mayNot = this.policy.classes.filter((c) => !c.approverMayApprove);
  assert.ok(mayNot.length > 0, "CTL-062: every class is approvable");
  const bad = [];
  for (const a of mayApprove) {
    const ok = sample((a.prefixes ?? [])[0] ?? (a.files ?? [])[0] ?? "");
    for (const n of mayNot) {
      const notOk = sample((n.prefixes ?? [])[0] ?? (n.files ?? [])[0] ?? (n.basenames ?? [])[0] ?? "");
      if (ok && notOk && approvable(this.policy, [ok, notOk])) bad.push(`${a.id} + ${n.id}`);
    }
  }
  none("CTL-062 a mixed change is approvable", bad);
});

// ---------------------------------------------------------------------------
// Live: the approver identity (CTL-061, CTL-063) and merges (CTL-028)
// ---------------------------------------------------------------------------
function gh(args) {
  try {
    return execFileSync("gh", args, { cwd: repo.ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("tooling: gh is not installed");
    throw new Error(`gh ${args.join(" ")} failed: ${error.stderr || error.message}`);
  }
}
const api = (p) => JSON.parse(gh(["api", "--method", "GET", p]));
const bare = (login) => String(login ?? "").replace(/\[bot\]$/, "").toLowerCase();
const approvers = () => repo.rootOfTrust.approverIdentities ?? [];
const agents = () => repo.rootOfTrust.agentIdentities ?? [];

function mergedPullRequests(slug, count, fields) {
  const [owner, name] = slug.split("/");
  const query = `query($o:String!,$n:String!){repository(owner:$o,name:$n){pullRequests(states:MERGED,last:${count}){nodes{number ${fields}}}}}`;
  return JSON.parse(gh(["api", "graphql", "-f", `query=${query}`, "-F", `o=${owner}`, "-F", `n=${name}`])).data.repository.pullRequests.nodes;
}

Then("at least one approver identity is listed in the root of trust", function () {
  assert.ok(approvers().length > 0, "CTL-061: root-of-trust.json lists no approverIdentities");
  assert.ok(repo.rootOfTrust.approverApp?.slug, "CTL-061: root-of-trust.json has no approverApp");
});

Then("no approver identity is also an agent identity", function () {
  const agentLogins = agents().map(bare);
  none("CTL-061 approver is also a build agent", approvers().filter((a) => agentLogins.includes(bare(a))));
});

// Reading contents, writing reviews and checks; GitHub always grants metadata: read.
const ALLOWED = { contents: ["read"], pull_requests: ["write", "read"], checks: ["write", "read"], actions: ["read"], metadata: ["read"] };

Then("the approver App has no permission beyond reading contents and writing reviews and checks", function () {
  const app = api(`apps/${repo.rootOfTrust.approverApp.slug}`);
  const granted = Object.entries(app.permissions ?? {});
  none("CTL-061 approver App permission", granted.filter(([scope, level]) => !(ALLOWED[scope] ?? []).includes(level)).map(([s, l]) => `${s}: ${l}`));
});

Then("no approver identity is a code owner", function () {
  const owners = repo.exists(".github/CODEOWNERS") ? repo.read(".github/CODEOWNERS").toLowerCase() : "";
  none("CTL-061 approver identity listed in CODEOWNERS", approvers().filter((a) => owners.includes(`@${bare(a)}`)));
});

Then("no ruleset for branch {string} lets an approver identity bypass it", function (branch) {
  const appId = repo.rootOfTrust.approverApp?.id;
  const rules = api(`repos/${this.slug}/rules/branches/${branch}`);
  const bad = [...new Set(rules.map((r) => r.ruleset_id))].flatMap((id) =>
    (api(`repos/${this.slug}/rulesets/${id}`).bypass_actors ?? [])
      .filter((a) => a.actor_type === "Integration" && a.actor_id === appId)
      .map((a) => `ruleset ${id} lets App ${a.actor_id} bypass (${a.bypass_mode})`),
  );
  none(`CTL-061 approver can bypass ${branch}`, bad);
});

Then("none of the last {int} merged pull requests was merged by an approver identity", function (count) {
  const logins = approvers().map(bare);
  const nodes = mergedPullRequests(this.slug, count, "mergedBy{login}");
  none("CTL-028 pull request merged by the approver", nodes.filter((pr) => logins.includes(bare(pr.mergedBy?.login))).map((pr) => `#${pr.number}`));
});

Then(
  "every approval by an approver identity in the last {int} merged pull requests is for a commit whose {string} check succeeded",
  function (count, checkName) {
    const logins = approvers().map(bare);
    const nodes = mergedPullRequests(this.slug, count, "reviews(states:APPROVED,first:50){nodes{author{login} commit{oid}}}");
    const bad = [];
    for (const pr of nodes) {
      for (const review of pr.reviews?.nodes ?? []) {
        if (!logins.includes(bare(review.author?.login))) continue;
        const sha = review.commit?.oid;
        const runs = sha ? api(`repos/${this.slug}/commits/${sha}/check-runs?check_name=${encodeURIComponent(checkName)}`).check_runs ?? [] : [];
        if (!runs.some((r) => r.conclusion === "success")) bad.push(`#${pr.number} approved ${sha ?? "an unknown commit"} without a passing "${checkName}"`);
      }
    }
    none("CTL-063 approval without a policy decision", bad);
  },
);
