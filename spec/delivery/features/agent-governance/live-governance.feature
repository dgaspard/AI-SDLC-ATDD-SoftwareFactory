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
  Scenario: Agents act under their own GitHub identity, which can never approve prod
    Decided 2026-10-10: one maintainer, so self-review is allowed. Separation of duties is
    between the human and the agents: agents never use the maintainer's credentials.
    Given the GitHub repository under test
    Then the GitHub environment "prod" requires at least one reviewer
    And at least one agent identity is listed in the root of trust
    And no agent identity is a reviewer for the GitHub environment "prod"
    And no agent identity has admin permission on the repository
    And no ruleset for branch "main" lets an agent identity bypass it
    And the GitHub environment "prod" accepts deployments only from protected branches

  @CTL-026 @awaiting:ENV-03 @nist:SR-4 @ssdf:PS.2.1 @env:prod
  Scenario: Every image running in prod has verified build and AI provenance
    Given the GitHub repository under test
    And the images recorded by the last prod deployment
    Then every image has a verified build provenance attestation from this repository
    And every image has a verified AI provenance attestation from this repository
