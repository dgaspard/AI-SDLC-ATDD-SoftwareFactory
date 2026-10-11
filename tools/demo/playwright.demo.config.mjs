// Visible view of the frozen browser suite for reconstruction runs (EXP-01). Reuses the protected
// config unchanged and only makes FE-002 visible and slower. Assertions, visual
// tolerances, and test code all come from spec/ and are not overridden here.
import path from "node:path";
import { fileURLToPath } from "node:url";
import base from "../../spec/tests/browser/playwright.config.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const slowMo = Number(process.env.DEMO_SLOWMO_MS ?? 1000);

export default {
  ...base,
  testDir: path.join(root, "spec/tests/browser"),
  outputDir: path.join(root, "test-results/demo"),
  grep: /\[FE-002\]/,
  // Visible Chromium smooths text differently from the headless shell, so the demo
  // compares against human-reviewed baselines captured from the visible browser.
  // Tolerance is inherited unchanged; the frozen suite still guards spec baselines.
  snapshotPathTemplate: path.join(
    root,
    "tools/demo/visual-baselines-headed/{arg}{ext}",
  ),
  // Slowed actions need more wall-clock time than the frozen 30 s budget.
  timeout: 180000,
  use: {
    ...base.use,
    headless: process.env.DEMO_HEADLESS === "1",
    launchOptions: { ...base.use?.launchOptions, slowMo },
  },
};
