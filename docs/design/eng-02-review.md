# ENG-02 planning: independent, calibrated engineering review

Status: [ENG-02](../history/backlog-completed.md#eng-02--independent-calibrated-engineering-review)
is complete; this is the planning record (decisions captured 2026-10-04). Mirrors
`docs/design/mvp-02a-admin-roster.md`'s role — a working doc, not a protected spec.

## Decided this session

**Reviewer governance model.** Two different situations get two different
rules, not one blanket "agent reviews everything" policy:

- **Substantial, not-yet-developed architecture** (the example given: a
  security architecture that doesn't exist yet) needs a human in the loop
  before a subagent builds it. The sequence is: a subagent drafts/proposes
  the design → a human approves it → *then* a fresh subagent builds against
  the approved design.
- **Once a pattern is repeatable** — e.g., another application consuming an
  already-designed security service — a fresh subagent can take over both
  the build and the review, because at that point the job isn't "design
  something new," it's "check that this new instance doesn't violate the
  rules a human already approved." The review's actual question becomes
  narrow and mechanical: did any agent or person go against the approved
  design, yes or no, cited by file and line.

This refines, rather than replaces, what's already in `BACKLOG.md`'s ENG-02
section ("a human signs off security and boundary findings") — the human
checkpoint moves earlier, to approving the design itself, rather than only
appearing at the end as a findings sign-off. Both checkpoints stay: human
approves novel architecture before it's built, and human still signs off
security/boundary findings on every review afterward.

**Scope and order:**

1. Build ENG-02's tooling now, apply it first to the existing JavaScript
   baseline (`impl-02`) — not the Python rebuilds.
2. After MVP-02A is specified and built (in JavaScript — see open question
   below), run the same review again with a fresh agent that has no memory
   of building it.
3. Specifically revisit SEC-01's calibration defect #5 (a route skipping
   the auth hook) once MVP-02A's real admin-only routes exist: was the
   synthetic planted version of this defect actually a good test of the
   real risk, or did the real case behave differently? This is deliberately
   a retrospective check on the spike's own methodology, not just a rerun
   of the same test. Feeds directly into the "second test" segment of
   the change-request story — this is its payoff moment, not a side note.
4. Python rebuild application (r1, r2, future r3) is **not** in ENG-02's
   near-term scope — see the open question below on exactly what this means
   for the live demo.

**Calibration defect list: six, not five.** The backlog's original five
(copied business logic across services, a payment reference leaked into a
span, a token check skipping signature verification, cross-service store
access, a missing OBS attribute on an untested rule) plus a sixth:
**an admin-only route missing its role check** — directly reusing SEC-01's
defect-#5 methodology, now against a real feature instead of a synthetic
one.

**Testing philosophy for this phase:** deliberately over-produce checks now
— simple, not fully organized — and curate later once there's enough
material to see what's actually redundant, the same way the 241-of-242
redundant auth-test audit happened only after the suite already existed.
Don't self-censor test volume up front; the audit/prune step comes after,
using ENG-02's own duplicate-detection tooling once it exists.

**Cleanup, deferred to after this task:** duplicate packages, libraries, or
stray Markdown files that don't belong get cleaned up once ENG-02's build is
done — see the open question below on scope.

**Physical structure confirmed:** `tools/review/` with the same
`portable/`/`project-specific/` split as `tools/security/` (A-15). CODEOWNERS
protection on `tools/review/portable/` mirrors `tools/security/portable/`.

## Resolved (2026-10-04)

1. **Python demo scope: unaffected.** "Continue to work in JS" applies only
   to ENG-02's review-application order and MVP-02A's build language. The
   Checkout reconstruction (A-05 — build in JS, delete and rebuild
   Checkout in Python) stays exactly as already decided; that's a
   separate, already-proven capability from r1/r2, not something this
   touches.
2. **Cleanup scope: full repo audit, deferred until ENG-02's duplicate-code
   tooling exists.** Not a narrow rehearsal-artifact sweep done by hand now
   — once `jscpd` (or whatever gets chosen) is built and running, use it to
   systematically find duplicate code/packages/stray docs across the whole
   repo, including but not limited to the r1/r2 rehearsal leftovers.

## Resolved (2026-10-04, second pass)

The four items that were execution judgment calls rather than settled
decisions are now answered:

1. **CODEOWNERS wiring.** `tools/security/portable/` and `tools/review/portable/`
   now have real entries in `.github/CODEOWNERS` (mandatory review, not a
   hash freeze — matching the lighter protection model their own READMEs
   already claimed but never wired up). This is also the intended pattern
   for the eventual CI/CD brainstorm: protection lives in CODEOWNERS, not
   scattered written instructions.
2. **"Fresh agent with no memory" mechanism.** Confirmed as the Agent tool
   with `isolation: "worktree"` — a genuinely separate agent instance with no
   conversation history, working on an isolated copy of the repo. No more
   elaborate mechanism is needed for this.

   **Amendment, 2026-10-05, from the first real run:** `isolation: "worktree"`
   is not available in this Cowork agent environment — it requires the
   calling agent's own root to be a git repository, which it isn't here (the
   actual repo is reached through a mounted connected folder instead). The
   call fails outright rather than degrading silently
   ("Cannot create agent worktree: not in a git repository..."). Substituted
   a plain fresh subagent call (still zero conversation memory of the build —
   the property that actually matters for independence) with an explicit
   no-edit instruction in the prompt as the safety net worktree isolation
   would otherwise have provided. This worked and produced a real,
   fact-checked review (`docs/engineering-reviews/eng-02-review-impl-02-2026-10-05.md`).
   Revisit this if ENG-02 is ever run from an environment where the agent's
   own working directory is itself a git repo (e.g. Claude Code running
   locally against a real clone) — worktree isolation should work there and
   is still the better safety property when available.
3. **The checklist/calibration list is a living list, not a fixed scope.**
   Six planted defects and whatever the first reviewer checklist covers are
   the *starting* point, not the ceiling. As repeatable engineering review
   patterns get discovered — a new defect class, a new checklist item that
   proves itself — they get added, the same way `tools/security/portable/`
   is already framed as something that "evolves as new defect classes get
   discovered" and eventually graduates into a shared, portable library once
   proven on a second real project. The goal stated plainly: get better
   reviews over time, and eventually hand that list to someone else so they
   aren't starting from zero.
4. **Threat-model note: its own single-purpose file**, not folded into
   another record's prose. Built at
   [`tools/review/project-specific/threat-model.md`](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/tools/review/project-specific/threat-model.md),
   ID-keyed (`THREAT-01`, `THREAT-02`, ...) so other records — decisions,
   contracts, future reviews — reference an entry by ID instead of
   duplicating it. `business-decisions.md` D-44 and `auth-contract.md` were
   updated to reference `THREAT-02` and `THREAT-01` directly rather than
   restating them. The right verbosity level for other agent-facing records
   (how much cross-referencing vs. inline context is actually useful) isn't
   settled yet — there isn't enough real usage yet to know — so for now the
   bias is toward single-purpose, ID-referenced files over consolidated,
   noisier ones; revisit once there's been enough real debugging against
   these files to know what's actually useful.

No open questions remain; tooling work can start.
