@tier:template @pillar:security @awaiting:ENV-02
Feature: GitHub can assume an AWS role only for its own environment
  OIDC lets a workflow swap a short-lived GitHub token for AWS credentials. Whoever can
  edit a workflow decides which jobs ask, so the role's trust policy is the real boundary
  (A-21): this repository, one GitHub environment, nothing broader.
  Catalog: aws-oidc.

  Background:
    Given the CloudFormation templates synthesized for "nonprod" and "prod"

  @CTL-035 @nist:AC-3 @ssdf:PO.5.2 @env:nonprod @env:prod
  Scenario: Every role GitHub can assume is pinned to this repository and its environment
    Then at least one IAM role trusts GitHub's OIDC provider
    And every role that trusts GitHub's OIDC provider requires the audience "sts.amazonaws.com"
    And every role that trusts GitHub's OIDC provider accepts only this repository's environment for its template
