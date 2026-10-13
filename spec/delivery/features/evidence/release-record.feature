@tier:static @pillar:compliance @awaiting:EVID-01
Feature: Every prod promotion leaves a release record
  A-23: reporting and governance documentation is a by-product of delivery. Each promotion
  records who changed what, under which spec, with which tests and evidence, and when.
  It is a GitHub Release with an attestation now; S3 Object Lock in a log-archive account
  is planned (catalog: release-record). Contract: DC-010.

  @CTL-060 @nist:CM-3 @ssdf:PS.3.1 @env:prod
  Scenario: The prod promotion publishes and attests a release record
    Given the delivery workflows
    Then at least one job deploys to "prod"
    And every job that deploys to "prod" writes the release record with "scripts/ci/release-record" after it deploys
    And every job that deploys to "prod" publishes the release record as a GitHub Release
    And every job that deploys to "prod" attests the release record with predicate type "https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/release-record/v1"
