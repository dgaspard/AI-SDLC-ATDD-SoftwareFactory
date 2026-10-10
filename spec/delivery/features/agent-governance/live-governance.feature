@tier:live @pillar:governance
Feature: GitHub and the deployed prod environment enforce human control
  The day-one required live checks (decided 2026-10-10, using A-13): these read GitHub
  settings and deployed images, which only CI can see, and an agent could claim them
  without independent verification. Read-only: the steps only call `gh api` and
  `gh attestation verify`.
  Catalog: branch-ruleset, prod-approval.

  @CTL-024 @nist:CM-3 @ssdf:PO.3.2 @env:nonprod @env:prod
  Scenario: Main accepts changes only through a reviewed pull request that passed the required checks
    Given the GitHub repository under test
    Then the rules for branch "main" require a pull request with code-owner review
    And the rules for branch "main" require every check named in the root of trust

  @CTL-025 @nist:AC-5 @ssdf:PO.2.1 @env:prod
  Scenario: Agents can never approve, merge or bypass
    Revised 2026-10-10 (A-22): the human gate is PR approval or a human merge. The sole
    maintainer's admin bypass is a human decision; agents never approve, merge or bypass.
    Merges must start from an up-to-date branch so the merged tree is the tested tree.
    Given the GitHub repository under test
    Then at least one agent identity is listed in the root of trust
    And no agent identity is a reviewer for the GitHub environment "prod"
    And no agent identity has admin permission on the repository
    And no ruleset for branch "main" lets an agent identity bypass it
    And no agent identity is a code owner
    And the GitHub environment "prod" accepts deployments only from protected branches
    And the rules for branch "main" require an up-to-date branch and approval of the last push

  @CTL-028 @nist:AC-5 @ssdf:PO.2.1 @env:nonprod @env:prod
  Scenario: No agent has merged a pull request
    The wrapper refuses merges (tools/github/agent.mjs); this is the independent check.
    Given the GitHub repository under test
    Then none of the last 100 merged pull requests was merged by an agent identity

  @CTL-026 @awaiting:ENV-03 @nist:SR-4 @ssdf:PS.2.1 @env:prod
  Scenario: Every image running in prod has verified build and AI provenance
    Given the GitHub repository under test
    And the images recorded by the last prod deployment
    Then every image has a verified build provenance attestation from this repository
    And every image has a verified AI provenance attestation from this repository
