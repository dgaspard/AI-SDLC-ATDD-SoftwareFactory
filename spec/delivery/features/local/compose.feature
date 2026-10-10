@tier:static @pillar:governance
Feature: One command starts the whole system locally
  Local is the agent's fast loop. It runs the same images the cloud runs, plus the
  payment fake and the OTLP test collector, with test endpoints switched on.
  Contract: DC-005. Catalog: local-compose.

  @CTL-005 @nist:CM-2 @ssdf:PO.5.1 @env:local
  Scenario: Compose runs every runnable project with the payment fake and telemetry collector
    Given the Compose file at the repository root
    Then it defines a service for each runnable project
    And it defines the "payment-fake" and "otel-collector" services
    And each runnable project's service is built from that project's Dockerfile
    And each backend service has PETCLINIC_TEST_ENDPOINTS set to "enabled"
