# Reconstruction experiment tools (EXP-01)

Not protected and not part of `npm test`. These scripts run the reconstruction
experiment in `PROJECT-PLAN.md` (delete Checkout, rebuild it with a fresh agent, verify)
and show the frozen tests visibly; they never change what the tests assert.

## Visible customer journey

```
npm run demo:journey
```

Runs the frozen FE-002 journey (login → book → veterinarian accepts and records
the visit → bill → pay) in a visible Chromium window, slowed so the audience can
follow. It uses `spec/tests/browser/playwright.config.js` unchanged except for:

| Setting | Frozen suite | Demo |
| --- | --- | --- |
| Tests | all FE checks | FE-002 only |
| Browser | headless | visible |
| Action delay | none | 1000 ms (`DEMO_SLOWMO_MS`) |
| Test timeout | 30 s | 180 s (slowed actions need more time) |
| Output | `test-results/browser` | `test-results/demo` |
| Screenshot baselines | `spec/frontend/visual-baselines/` | `tools/demo/visual-baselines-headed/` |

Assertions, screenshot tolerances, fixtures, and the test file are the frozen ones.

### Why separate screenshot baselines

The visible Chromium smooths text edges differently from the headless shell used
by `npm test` (first run: 824 differing pixels, all on text edges; layout, colors
and content matched). The demo therefore compares against baselines captured from
the visible browser, with the same frozen tolerance. The frozen headless suite
still checks the original baselines on every `npm test`.

Create or refresh them only on the operator's machine, then review the images before
committing:

```
npm run demo:baselines
```

Regenerate only when the frozen baselines in `spec/frontend/visual-baselines/`
change, or after a Chromium upgrade, never to make a failing demo pass.
Change the pace with `DEMO_SLOWMO_MS=1500 npm run demo:journey` (the delay is added
before every click and entry; page loads and checks are not slowed).

Step-through mode: `npm run demo:journey:step` opens the Playwright Inspector,
pauses before each browser action, and highlights the test line. Press **Step over**
(F10) to advance one action or **Resume** (F8) to run to the end. It shows the test
code beside the browser, which is useful when explaining what the test checks.
`DEMO_HEADLESS=1` runs the same demo without a window (for checks only).

## Rehearsal and on-stage flow

| Step | Command | Timed |
| --- | --- | --- |
| 1. Prepare a disposable workspace | `tools/demo/prepare-rehearsal.sh [name]` (from the main repo) | no |
| 2. JavaScript "before" run | `npm run demo:journey` (in the workspace) | no |
| 3. Delete Checkout (asks first) | `tools/demo/delete-checkout.sh` | yes, starts the clock |
| 4. Rebuild in fresh Claude Code | `claude "$(cat tools/demo/rebuild-checkout-prompt.md)"` | yes |
| 5. Verify and report | `tools/demo/finish-rehearsal.sh` (full) or `--journey-only` (visible journey only) | yes |

Workspaces go to `~/petclinic-demo-runs/<name>` (override with `DEMO_RUNS_DIR`),
built from tag `demo-01-baseline`. Each has a fresh git history that never
contained the JavaScript Checkout, and all dependencies are preinstalled. Step 5
appends timings and the result to `.demo/run.log` in that workspace.

### Chained rehearsals (language round trip)

`tools/demo/fork-workspace.sh r1 r2` copies a finished workspace (leaving the
original as its record), refreshes `tools/demo` from the main repo, and rebuilds a
copied Python virtual environment. Then `delete-checkout.sh javascript` or
`delete-checkout.sh python` picks the target language and matching prompt
(`rebuild-checkout-prompt-js.md` or `rebuild-checkout-prompt.md`). The direction is
logged in `.demo/run.log`. The JavaScript prompt allows the shared
`services/platform/` runtime, as in the original build, so JavaScript rebuild times
are not directly comparable with Python ones.

Full verification (visible journey + `npm test`) took 9m28s in r1. `--journey-only`
(about 20 s) shows the outcome quickly; experiment records keep the full run.

Disclosed limits: the rebuild prompt is prepared and identical every run; the
shared JavaScript `services/platform/` and project docs (including the JavaScript
engineering review) remain readable; Claude Code's own settings keep it inside the
workspace, but the main repo still exists on the same machine.
