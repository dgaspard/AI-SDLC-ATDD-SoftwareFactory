# Portable review engines

Nothing in this folder may reference petclinic's routes, domain, or business
logic. If a check needs that kind of project knowledge to run, it belongs in
`../project-specific/` instead, not here.

**The test to apply when adding anything here:** if you ran this exact
mechanism against a different project, would it need new *parameters*, or
would it need rewritten *logic*? New parameters only → it's portable, put it
here and have it read its parameters from `../project-specific/`. Rewritten
logic → it's project-specific, it doesn't belong here no matter how it's
abstracted. (This is the same test `tools/security/portable/README.md`
uses — ENG-02's import-boundary check is where this split started.)

## What's planned here (not yet built — see `docs/design/eng-02-review.md`)

- **Import-boundary check** — reads each service's actual imports and flags
  a cross-service one that isn't `services/platform/`. The folder-to-service
  mapping (which paths belong to which service) is project-specific
  *parameters*; the "walk imports, flag violations" logic is the portable
  *engine*.
- **Duplicate-code detection** (`jscpd`, confirmed — reads both JS and
  Python) — a thin wrapper that reads its target paths and exclusions from
  `../project-specific/`.
- **Route-vs-contract cross-check** — reads a service's actual registered
  route table and compares each route's enforced role against what
  `spec/contracts/*.openapi.json` declares via `x-roles`. This is the engine
  `tools/security/project-specific/auth-coverage-notes.md` describes as "not
  built yet, revisit after the spike runs" — SEC-01 has now run, and
  ENG-02's MVP-02A revisit (adding real admin-only routes) is the concrete
  trigger to build it.
- Security scanning and dependency audit are **not** re-implemented here —
  they're reused directly from `tools/security/portable/` so ENG-02 measures
  exactly what that spike already calibrated, not a parallel copy of it.

## Protection

Meant to work the same way as `tools/security/portable/` — CODEOWNERS
review required, not an immutable hash freeze, since these engines are
expected to evolve as new defect classes get discovered. See the parent
README's note: this isn't actually wired into `.github/CODEOWNERS` on `main`
yet for either folder.
