import fs from "node:fs";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const factory=fileURLToPath(new URL("../../",import.meta.url));
const {freeze}=await import(pathToFileURL(path.join(factory,"tools/guard/freeze.mjs")));
freeze(fileURLToPath(new URL("../../",import.meta.url)));
