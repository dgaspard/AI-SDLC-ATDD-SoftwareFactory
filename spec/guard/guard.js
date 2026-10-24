import fs from "node:fs";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const factory=fileURLToPath(new URL("../../",import.meta.url));
const {createGuard}=await import(pathToFileURL(path.join(factory,"tools/guard/guard.mjs")));
export const {CONFIG, MANIFEST, listProtected, manifestFor, compare, scanSkips, REVIEW_WARNING_DAYS, taggedElements, scanTags}=createGuard(JSON.parse(fs.readFileSync(new URL("./protected-paths.json",import.meta.url))));
