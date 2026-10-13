@service:customer
Feature: Pets owned by a customer
  Customers own pets. Each pet has exactly one owner.
  Decisions: D-01, D-21, Q-03. Schema: PetCreate, PetRead.

  Background:
    Given the clinic clock reads "2026-10-05 09:00" Central Time
    And customer "Jordan Rivera" exists

  Scenario: Add a pet to a customer
    When Jordan adds a pet "Milo", a "cat" of breed "Siamese" born about "2022-05-01"
    Then the pet is saved with a new pet ID
    And Milo's owner is Jordan
    And Jordan's pets include Milo

  Scenario: A customer can own several pets
    Given Jordan owns the pet "Milo"
    When Jordan adds a pet "Luna"
    Then Jordan's pets are "Milo" and "Luna"

  Scenario: Unknown breed is allowed
    When Jordan adds a pet "Pepper", a "dog" of breed "Unknown" born about "2021-01-01"
    Then the pet is saved

  Scenario: A birth date up to 30 years ago is allowed
    When Jordan adds a pet "Pepper", a "dog" of breed "Unknown" born about "1996-10-05"
    Then the pet is saved

  Scenario: Estimated birth date cannot be more than 30 years ago
    When Jordan adds a pet "Milo" born about "1990-01-01"
    Then the pet is rejected as invalid

  Scenario: Estimated birth date cannot be in the future
    When Jordan adds a pet "Milo" born about "2026-10-06"
    Then the pet is rejected as invalid

  Scenario Outline: Required pet fields
    When Jordan adds a pet without "<field>"
    Then the pet is rejected as invalid
    Examples:
      | field              |
      | name               |
      | type               |
      | breed              |
      | estimatedBirthDate |

  Scenario: Confirm pet ownership for another service
    Given Jordan owns the pet "Milo"
    And customer "Sam Lee" owns the pet "Rex"
    When ownership of Milo by Jordan is checked
    Then ownership is confirmed
    When ownership of Rex by Jordan is checked
    Then ownership is refused
