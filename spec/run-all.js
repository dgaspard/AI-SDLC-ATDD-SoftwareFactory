// PetClinic compatibility binding; factory implementation is separately owned.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROJECTS } from "./harness/config.js";
const suiteRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(suiteRoot, "..");
const { runLegacy } = await import(pathToFileURL(path.join(process.env.FACTORY_CHECKOUT ?? root, "tools/factory/index.mjs")));
await runLegacy({root, suiteRoot, results: path.join(root,"test-results","runs"),
  policyFile: path.join(suiteRoot,"test-policy.json"),
  services: Object.keys(PROJECTS).filter(id=>PROJECTS[id].kind==="service"),
  argv: process.argv.slice(2), invocation: "node spec/run-all.js",
  treeEnvironmentVariable: "PETCLINIC_TREE"});
