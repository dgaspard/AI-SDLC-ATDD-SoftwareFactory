import fs from "node:fs";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const factory=fileURLToPath(new URL("../../",import.meta.url));
const {check}=await import(pathToFileURL(path.join(factory,"tools/guard/check.mjs")));
check(fileURLToPath(new URL("../../",import.meta.url)));
