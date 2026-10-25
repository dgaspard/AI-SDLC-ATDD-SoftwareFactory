// Factory self-verification binding. Application suites belong to consumers.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const suiteRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(suiteRoot, "..");
const { runLegacy } = await import(pathToFileURL(path.join(root, "tools/factory/index.mjs")));
await runLegacy({root, suiteRoot, results: path.join(root,"test-results","runs"),
  policyFile: path.join(suiteRoot,"test-policy.json"),
  services: [],
  argv: process.argv.slice(2), invocation: "node spec/run-all.js",
  treeEnvironmentVariable: "FACTORY_TREE"});
