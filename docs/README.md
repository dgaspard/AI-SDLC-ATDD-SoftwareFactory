# Where documents live

Every document has one home, chosen by what kind of content it is. Before creating a
file, find its kind below and add to the existing home. Create a new file only where
the table says a new file is expected (one per backlog item, review, rehearsal or
handoff). Don't create dated recaps, scratch plans or one-off notes: fold their content
into the homes below and let git history keep the conversation.

## Kinds of content and their homes

| Kind of content | Home | New file? | Who edits |
|---|---|---|---|
| Orientation: what the repo is, how to run it | [`README.md`](../README.md) | No | Anyone |
| Agent rules | [`AGENTS.md`](../AGENTS.md) | No | Human only (protected) |
| Claude Code entry point: a pointer to `AGENTS.md` and the canonical documents, no rules of its own | [`CLAUDE.md`](../CLAUDE.md) | No | Human only (protected) |
| Product direction, factory shape, ordered roadmap, non-goals, success criteria, reference-application boundaries, experiment protocol, risks | [`PROJECT-PLAN.md`](../PROJECT-PLAN.md) | No | Agent drafts, human approves |
| Work items in roadmap order, status, open follow-ups, proposals, deferred work | [`BACKLOG.md`](../BACKLOG.md) | No | Agent drafts, human approves |
| Product and business decisions (D-xx), domain model, schema decisions | [`docs/specs/`](specs/) | No | Human only (protected) |
| Architecture and delivery decisions (A-xx) | [`docs/decisions/architecture.md`](decisions/architecture.md) | No: add a row | Agent drafts, human approves |
| Design notes for one backlog item: options, decisions in progress, how it was built | [`docs/design/`](design/) | One per backlog item or decision: `<id>-<topic>.md` | Agent drafts, human approves |
| Standing guides: the development workflow, observability standards | [`docs/development-workflow.md`](development-workflow.md), [`docs/observability.md`](observability.md) | No | Agent drafts, human approves |
| Generated delivery guide | [`docs/delivery/environments.md`](delivery/environments.md) | No | Generated from `spec/delivery/catalog.yaml`; never hand-edit |
| Engineering and security review records | [`docs/engineering-reviews/`](engineering-reviews/) | One per review, dated | Reviewer agent writes, human signs off |
| Reconstruction rehearsal records | [`docs/rehearsals/`](rehearsals/) | One per run (`r<N>.md`) | Agent writes from the run record |
| Task handoffs between sessions | [`docs/handoffs/`](handoffs/) | One per item | Agent writes |
| Completed backlog items, superseded plans | [`docs/history/`](history/) | Rarely: append to an existing file | Agent moves content verbatim |
| Draft changes to protected files | The pull request (a patch for the human to apply) | Never in `docs/` | Agent drafts, human applies and freezes |
| Talks, decks, presentation notes | Not kept in this repository (A-25) | No | — |

## Rules

- **Decisions have IDs and one log.** Business decisions are D-xx in
  `docs/specs/business-decisions.md`. Project decisions are A-xx in
  `docs/decisions/architecture.md`. A design note may propose a decision; once made,
  it's recorded in the log, and the design note links to the ID.
- **Status lives only in `BACKLOG.md`.** Other documents link to an item instead of
  repeating its status. When an item is done, move its section verbatim to
  `docs/history/backlog-completed.md` and add a row to the Done table.
- **Proposals aren't requirements.** New ideas go to `BACKLOG.md § Proposed (not
  approved)` until Dustin moves them into an item.
- **Evidence is append-only.** Reviews, rehearsals and handoffs record what happened on
  a date; correct them with a dated note, don't rewrite them.
- **Protected paths are read-only for agents** (`AGENTS.md`). If a protected file links
  to a document, moving that document needs a human-approved spec change.

## The docs pass, after every feature commit

Documentation is maintained like code. After each feature lands, context either grows
in its home or is taken away, before the next feature starts.

The pass is **part of code review**. The ENG-02 reviewer, a fresh agent session with no
memory of building the feature, runs it as checklist item 6 in
[`tools/review/review-prompt.md`](../tools/review/review-prompt.md) and reports doc
findings next to code findings. The fixes land as a small follow-up change. A fresh
session reads the docs the way the next person or agent will. The builder knows things
the docs don't say, so it's the wrong reviewer, for the same reason it doesn't certify
its own code.

Checklist:

1. **Status.** Every item the feature touched shows its true state in `BACKLOG.md`.
   Finished items move verbatim to `docs/history/backlog-completed.md`, with a Done row.
2. **Decisions.** Decisions made during the feature are rows in their log (A-xx here,
   or D-xx drafted for a human freeze), and design notes link to the IDs instead of
   restating them.
3. **Homes.** Any file outside the homes in the table above gets folded into its home
   and deleted. That includes recaps, scratch plans, applied patches and notes named
   after a date or session.
4. **Growth and removal.** Text that no longer matches the code, a frozen spec or a
   later decision is corrected or removed, not annotated with another "update" note.
   Superseded material moves to `docs/history/` only if its reasoning is still worth
   reading.
5. **Links.** Every relative link and backticked repository path resolves. A broken
   link inside a protected file goes to the human as a patch.
6. **No duplicates.** Each fact lives in one place; elsewhere, link to it.

Prompt for running the pass on its own (for example, after a docs-only change):

> Run the docs pass in `docs/README.md` for the change just merged (`<commit or PR>`).
> Read `AGENTS.md`, `docs/README.md` and `BACKLOG.md` first. Propose a diff, don't touch
> protected paths, and list anything that needs a human decision or a protected patch.

## Current design notes

| Item | Note |
|---|---|
| A-13 | [CI/CD placement framework](design/ci-cd-placement.md) |
| CI-02 | [The required application gate (local slice)](design/ci-02-application-gate.md) |
| DORA-01 | [Delivery metrics (local slice)](design/dora-01-metrics.md) |
| ENG-02 | [Independent, calibrated engineering review](design/eng-02-review.md) |
| EVID-01 | [The change-evidence report (local slice)](design/evid-01-change-evidence.md) |
| FE-01 | [Design preview (inert HTML)](design/fe-01-design-preview.html) |
| MVP-02A | [Administrator role and veterinarian roster](design/mvp-02a-admin-roster.md) |
| REVIEW-02 | [A policy-governed PR approver](design/review-02-pr-approver.md) |
| SPEC-07 | [Suppressing tests and retiring features](design/spec-07-suppression-and-retirement.md) |
| SPEC-08 | [Delivery as an executable specification](design/spec-08-delivery.md) |
| START-02 | [A factory core that many applications use](design/start-02-factory-core.md) |
