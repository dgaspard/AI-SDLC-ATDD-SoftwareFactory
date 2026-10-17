@tier:static @pillar:governance
Feature: The review policy keeps humans on the root of trust
  REVIEW-02 (A-29): an approver identity may approve a pull request only when the
  protected review policy (review-policy.json) allows every path it changes. These checks
  read only the policy and the protected-path lists, so they hold before any approver
  exists. Catalog: prod-approval.

  @CTL-062 @nist:CM-5 @ssdf:PO.3.2 @env:nonprod @env:prod
  Scenario: The approver may never approve a change to the root of trust or its own machinery
    Given the review policy
    Then every protected path and every root-of-trust path is in a class the approver may not approve
    And the review policy, the agent wrapper and every workflow are in a class the approver may not approve
    And a path no class names is in a class the approver may not approve
    And a change that touches any path the approver may not approve can't be approved
