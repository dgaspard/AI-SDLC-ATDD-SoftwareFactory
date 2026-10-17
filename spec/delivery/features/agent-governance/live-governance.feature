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
  Scenario: Build agents can never approve, merge or bypass
    Revised 2026-10-10 (A-22) and REVIEW-02 (A-29): build agents never approve, merge or
    bypass. Approval comes from a human, or from the separate approver identity under the
    protected review policy (CTL-061..063). The sole maintainer's admin bypass is a human
    decision. Merges must start from an up-to-date branch so the merged tree is the
    tested tree.
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
    The approver identity approves but never merges (REVIEW-02).
    Given the GitHub repository under test
    Then none of the last 100 merged pull requests was merged by an agent identity
    And none of the last 100 merged pull requests was merged by an approver identity

  @CTL-061 @awaiting:REVIEW-02 @nist:AC-6 @ssdf:PO.2.1 @env:nonprod @env:prod
  Scenario: The approver identity can approve, and nothing more
    REVIEW-02: a separate GitHub App approves eligible pull requests. It can't push code,
    change workflows or administer the repository, isn't a code owner (so root-of-trust
    paths still need the human), and no ruleset lets it bypass.
    Given the GitHub repository under test
    Then at least one approver identity is listed in the root of trust
    And no approver identity is also an agent identity
    And the approver App has no permission beyond reading contents and writing reviews and checks
    And no approver identity is a code owner
    And no ruleset for branch "main" lets an approver identity bypass it

  @CTL-063 @awaiting:REVIEW-02 @nist:AU-10 @ssdf:PO.3.3 @env:nonprod @env:prod
  Scenario: Every approval by the approver identity rests on a passing policy decision for that commit
    REVIEW-02: an approval is evidence only if the protected policy passed on the exact
    commit approved. The "Review policy" check carries the decision record.
    Given the GitHub repository under test
    Then every approval by an approver identity in the last 100 merged pull requests is for a commit whose "Review policy" check succeeded

  @CTL-026 @awaiting:ENV-03 @nist:SR-4 @ssdf:PS.2.1 @env:prod
  Scenario: Every image running in prod has verified build and AI provenance
    Given the GitHub repository under test
    And the images recorded by the last prod deployment
    Then every image has a verified build provenance attestation from this repository
    And every image has a verified AI provenance attestation from this repository
