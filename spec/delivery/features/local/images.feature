@tier:static @pillar:security
Feature: Hardened container images for every runnable project
  Each project that runs as a process is packaged as one container image, built the
  same way for every environment (A-17). The image is what gets promoted from non-prod
  to prod, so its hardening is checked before it is ever built.
  Contract: DC-001. Catalog: container-images.

  @CTL-001 @nist:CM-2 @ssdf:PO.3.2 @env:local @env:nonprod @env:prod
  Scenario: Every runnable project has a Dockerfile
    Given the runnable projects in this repository
    Then each project has a Dockerfile in its folder

  @CTL-002 @nist:AC-6 @ssdf:PW.9.1 @env:local @env:nonprod @env:prod
  Scenario: Images do not run as root
    Given the Dockerfile of each runnable project
    Then the final stage of each Dockerfile sets a non-root USER

  @CTL-003 @nist:SR-3 @ssdf:PW.4.1 @env:local @env:nonprod @env:prod
  Scenario: Base images are pinned by digest
    Given the Dockerfile of each runnable project
    Then every external base image is pinned by sha256 digest

  @CTL-004 @nist:CM-7 @ssdf:PW.9.1 @env:local @env:nonprod @env:prod
  Scenario: Images never switch on test endpoints
    Given the Dockerfile of each runnable project
    Then no Dockerfile instruction mentions PETCLINIC_TEST_ENDPOINTS
