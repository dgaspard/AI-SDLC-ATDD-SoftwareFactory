@tier:static @pillar:governance
Feature: Agent-built delivery stays accountable to humans
  Agents build the delivery code (A-20). Humans own the root of trust that runs this
  spec, and only a human can release to prod. Every image carries two attestations:
  how it was built (SLSA) and who built it (AI provenance, DC-007).
  Catalog: build-provenance, ai-provenance, root-of-trust, prod-approval.

  @CTL-020 @awaiting:CI-02 @nist:SR-4 @ssdf:PS.2.1 @env:nonprod @env:prod
  Scenario: Every image build publishes signed build provenance
    Given the delivery workflows
    Then at least one job builds a container image
    And every job that builds a container image uses "actions/attest-build-provenance"
    And every job that builds a container image is granted "id-token: write" and "attestations: write"

  @CTL-021 @awaiting:CI-02 @nist:AU-10 @ssdf:PS.3.2 @env:nonprod @env:prod
  Scenario: Every image build publishes an AI provenance attestation
    Given the delivery workflows
    Then at least one job builds a container image
    And every job that builds a container image attests with predicate type "https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/ai-provenance/v1"

  @CTL-022 @nist:CM-5 @ssdf:PO.3.2 @env:local @env:nonprod @env:prod
  Scenario: The human-owned root of trust runs the delivery spec
    Given the root-of-trust workflow "guard.yml"
    Then it runs on every pull request and on every push to main
    And it runs the guard check and the delivery suite
    And it has a job named for each required check in the root of trust
    And no delivery workflow is part of the root of trust

  @CTL-023 @awaiting:ENV-03 @nist:AC-5 @ssdf:PO.2.1 @env:prod
  Scenario: Prod receives exactly what was tested and a human let through
    Revised 2026-10-10 (A-22): promotion is automatic after a human approves or merges,
    so the job itself proves the images are the tested ones and that no agent merged them.
    Given the delivery workflows
    Then at least one job deploys to "prod"
    And every job that deploys to "prod" runs in the GitHub environment "prod"
    And every job that deploys to "prod" verifies both attestations before it deploys
    And every job that deploys to "prod" compares the attested tree with main's tree before it deploys
    And every job that deploys to "prod" checks who merged the change before it deploys
