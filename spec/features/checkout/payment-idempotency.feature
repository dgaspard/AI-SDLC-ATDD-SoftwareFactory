@service:checkout
Feature: Duplicate payment protection
  Repeating a payment request with the same attempt key returns the original result
  without repeating its effects.
  Decisions: D-61, D-62, D-63, D-12. Telemetry: OBS-031, OBS-038.

  Background:
    Given Milo's finalized Wellness checkout has a remaining balance of "$50.00"

  # SPEC-07: accepted risk. Expected to fail on builds that don't record the attempt
  # key before a dependency's transport failure (ENG-02 REV-001, Python Checkout r4).
  # It runs only in the accepted-risks suite; a pass is reported as a STATE CHANGE.
  # @accepted-risk @risk:REV-001 @source:eng-02-review-r4-python-2026-10-07 @owner:dustin @review:2027-01-31
  Scenario: A same-key retry after Customer drops the connection does not charge again
    Given the fake payment provider will authorize the card
    And Customer will drop the connection on the next account change
    When Jordan pays the visit balance with attempt key "key-1"
    And the identical request is sent again with attempt key "key-1"
    Then the fake payment provider was called only once
    And Customer applied at most one credit

  Scenario: Replay an authorized payment
    Given the fake payment provider will authorize the card
    And Jordan paid the visit balance with attempt key "key-1"
    When the identical request is sent again with attempt key "key-1"
    Then both requests return the same result
    And the second result is marked as a replay
    And the fake payment provider was called only once
    And Customer received one credit and Reservation one completion request

  Scenario: Concurrent identical requests share one authorization
    Given the fake payment provider will authorize the card
    When two identical requests with attempt key "key-1" arrive at the same time
    Then both requests return the same authorized result
    And the fake payment provider was called only once
    And Customer received one credit and Reservation one completion request

  Scenario: Replay a declined payment
    Given the fake payment provider will decline the card
    And Jordan paid the visit balance with attempt key "key-1"
    When the identical request is sent again with attempt key "key-1"
    Then both requests return the same declined result
    And the fake payment provider was called only once

  Scenario: Changed input under the same key is a conflict
    Given Jordan paid the visit balance with card "card-A" and attempt key "key-1"
    When a request with card "card-B" and attempt key "key-1" is sent
    Then the request is refused as an idempotency conflict
    And the fake payment provider receives no additional request
    And the original attempt is unchanged

  Scenario: Repeated cash recording credits only once
    Given Dr Avery Taylor recorded a "$50.00" cash payment with attempt key "cash-1"
    When the same cash recording is sent again with attempt key "cash-1"
    Then the same result is returned
    And the second result is marked as a replay
    And Customer received one credit

  Scenario: A new cash attempt cannot pay a settled balance again
    Given Dr Avery Taylor recorded a "$50.00" cash payment with attempt key "cash-1"
    When Dr Avery Taylor records "$50.00" cash with attempt key "cash-2"
    Then the request is refused as "already settled"
    And Customer received one credit

  Scenario: Changed cash input under the same key is a conflict even after settlement
    Given Dr Avery Taylor recorded a "$50.00" cash payment with attempt key "cash-1"
    When Dr Avery Taylor records "$40.00" cash with attempt key "cash-1"
    Then the request is refused as an idempotency conflict
    And Customer received one credit

  Scenario Outline: GAP-11 replay preserves the original bill after later settlement
    When a "<method>" payment of "$20.00" uses attempt key "first"
    Then the payment response succeeds
    And the payment response is remembered
    When Dr Avery Taylor records "$30.00" cash with attempt key "later"
    Then the payment response succeeds
    And the remaining balance is "$0.00"
    When a "<method>" payment of "$20.00" uses attempt key "first"
    Then the original payment response snapshot is replayed
    And the stored bill remains settled with two visit attempts
    And replay sends no additional payment, credit, or completion
    Examples:
      | method |
      | card   |
      | cash   |

  Scenario: GAP-12 booking and visit payments use independent key scopes
    Given the booking fee was collected with attempt key "shared"
    When a "card" payment of "$50.00" uses attempt key "shared"
    Then the payment response succeeds
    And the booking and visit payments are independent

  Scenario Outline: GAP-12 card and cash share the bill key scope
    When a "<first>" payment of "$20.00" uses attempt key "shared"
    Then the payment response succeeds
    And the payment response is remembered
    When a "<second>" payment of "$20.00" uses attempt key "shared"
    Then the request is refused as an idempotency conflict
    And the remaining balance is "$30.00"
    And the checkout retains only the remembered attempt
    And replay sends no additional payment, credit, or completion
    Examples:
      | first | second |
      | card  | cash   |
      | cash  | card   |

  Scenario Outline: GAP-13 failed follow-up replay never retries side effects
    Given <dependency> will fail to <failure>
    When a "<method>" payment of "$50.00" uses attempt key "failed"
    Then the result is reported as authorized but completion failed, needing manual recovery
    And the payment response is remembered
    When a "<method>" payment of "$50.00" uses attempt key "failed"
    Then the original failed payment response is replayed
    And replay sends no additional payment, credit, or completion
    Examples:
      | method | dependency  | failure                     |
      | card   | Reservation | complete the reservation    |
      | cash   | Reservation | complete the reservation    |
      | card   | Customer    | record the account credit   |
      | cash   | Customer    | record the account credit   |

  Scenario: GAP-12 separate bills may reuse the same visit-payment key
    When a "card" payment of "$50.00" uses attempt key "shared"
    Then the payment response succeeds
    And the payment response is remembered
    Given another recorded visit has its own finalized bill
    When a "card" payment of "$50.00" uses attempt key "shared"
    Then the payment response succeeds
    And the two bills have independent paid attempts
