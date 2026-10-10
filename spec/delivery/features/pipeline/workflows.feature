@tier:static @pillar:security
Feature: Workflows run with least privilege and pinned dependencies
  Applies to every workflow in .github/workflows, including the human-owned root of
  trust: a rule the humans don't follow is not a rule. Delivery workflows (DC-006) are
  agent-built. Catalog: workflow-hardening, aws-oidc, security-scans, sbom.

  @CTL-010 @nist:AC-6 @ssdf:PO.5.1 @env:nonprod @env:prod
  Scenario: Every workflow defaults to read-only permissions
    Given every GitHub Actions workflow in the repository
    Then each workflow declares top-level permissions
    And no workflow or job grants "write-all"
    And top-level permissions grant no write scope

  @CTL-011 @nist:SR-3 @ssdf:PW.4.1 @env:nonprod @env:prod
  Scenario: Actions from outside this repository are pinned to a full commit SHA
    Given every GitHub Actions workflow in the repository
    Then every external action reference is pinned to a 40-character commit SHA

  @CTL-012 @awaiting:CI-02 @nist:IA-5 @ssdf:PO.5.2 @env:nonprod @env:prod
  Scenario: AWS access uses short-lived OIDC credentials, never stored keys
    Given every GitHub Actions workflow in the repository
    Then no workflow mentions AWS access keys or secret keys
    Given the delivery workflows
    Then at least one job configures AWS credentials
    And every job that configures AWS credentials assumes a role with "id-token: write"

  @CTL-013 @awaiting:CI-02 @nist:RA-5 @ssdf:PW.7.2 @env:nonprod @env:prod
  Scenario: Security scans gate delivery
    Given the delivery workflows
    Then delivery runs each portable security scan:
      | script                  |
      | run-sast.sh             |
      | run-secret-scan.sh      |
      | run-dependency-audit.sh |
    And those scan steps set SECURITY_GATE to "fail"
    And no scan step or its job can continue on error
    And each portable scan script reads SECURITY_GATE

  @CTL-015 @awaiting:ENV-03 @nist:CM-3 @ssdf:PO.5.1 @env:nonprod @env:prod
  Scenario: Pull requests deploy to non-prod; only main deploys to prod
    A-22: every PR is tested in an ephemeral non-prod environment before a human approves it.
    pull_request_target is never used: it runs with secrets on code from forks.
    Given the delivery workflows
    Then at least one job deploys to "nonprod"
    And every workflow that deploys to "nonprod" runs on pull requests and never on "pull_request_target"
    And every job that deploys to "nonprod" runs in the GitHub environment "nonprod"
    And every workflow that deploys to "prod" runs only on push to "main"

  @CTL-027 @awaiting:CI-02 @nist:CM-5 @ssdf:PO.3.2 @env:nonprod @env:prod @pillar:governance
  Scenario: Delivery workflows hold privilege only; scripts hold the logic
    A-21: the YAML decides triggers, permissions, OIDC, environment and role, and is
    human-owned. Each step is one call to an agent-built script with plain arguments, so
    no expression is interpolated into a shell and logic never hides in YAML.
    Given the delivery workflows
    Then every run step is a single call to a delivery script with plain arguments
    And every delivery script a run step calls exists and is executable

  @CTL-014 @awaiting:CI-02 @nist:CM-8 @ssdf:PS.3.2 @env:nonprod @env:prod
  Scenario: Every image build produces an SBOM
    Given the delivery workflows
    Then at least one job builds a container image
    And every job that builds a container image also generates an SBOM with Syft
