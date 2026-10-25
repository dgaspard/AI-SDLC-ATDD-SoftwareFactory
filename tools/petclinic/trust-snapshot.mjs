// Materialize authority only from an explicit owner-reviewed local commit.
// Does not approve a commit, update a manifest, edit the checkout, or fetch.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const options = {},
  args = process.argv.slice(2);
try {
  while (args.length) {
    const key = args.shift();
    if (
      !["--root", "--reviewed-revision", "--output"].includes(key) ||
      options[key] ||
      !args.length
    )
      throw Error(
        "Expected --root PATH --reviewed-revision FULL_SHA --output EXTERNAL_FILE",
      );
    options[key] = args.shift();
  }
  if (
    !options["--root"] ||
    !options["--output"] ||
    !/^[a-f0-9]{40}$/.test(options["--reviewed-revision"] ?? "")
  )
    throw Error(
      "Explicit root, reviewed full commit, and external output required",
    );
  const root = fs.realpathSync(options["--root"]),
    revision = options["--reviewed-revision"];
  const output = path.resolve(options["--output"]);
  const parent = fs.realpathSync(path.dirname(output));
  if (parent === root || parent.startsWith(root + path.sep))
    throw Error("Trust snapshot must be outside the consumer checkout");
  const git = (...a) =>
    execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  if (git("rev-parse", "--show-toplevel").toString().trim() !== root)
    throw Error("Expected consumer worktree root");
  if (git("rev-parse", `${revision}^{commit}`).toString().trim() !== revision)
    throw Error("Expected exact local commit");
  const read = (p) => git("show", `${revision}:${p}`);
  const configBytes = read("spec/factory/petclinic/config.json"),
    c = JSON.parse(configBytes);
  const source = JSON.parse(read(c.trust.configuration));
  const paths = JSON.parse(read(c.trust.protectedPaths));
  const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
  const policy = {
    schemaVersion: 1,
    applicationId: c.application.id,
    repository: c.application.repository,
    factory: c.factory,
    configSha256: sha(configBytes),
    requiredSuites: source.requiredSuites,
    requiredEvidence: source.requiredEvidence,
    protectedPaths: paths.protected,
    protectedManifestSha256: sha(read(c.trust.manifest)),
  };
  fs.writeFileSync(output, JSON.stringify(policy, null, 2) + "\n", {
    flag: "wx",
    mode: 0o444,
  });
  console.log(
    JSON.stringify({
      output,
      reviewedRevision: revision,
      sha256: sha(fs.readFileSync(output)),
    }),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 4;
}
