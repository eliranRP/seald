Feature: Primary nav active-tab indicator follows the IA

  Background:
    Given the user is signed in as "alice@example.com"

  @nav @smoke
  Scenario: Documents tab stays active on the dashboard
    When the user opens the Documents dashboard
    Then the primary nav highlights "Documents"

  # Bug A regression (audit 2026-05-02): existing-envelope detail and the
  # post-send confirmation are entered from Documents — they must not
  # mis-light the "Sign" tab.
  @nav @smoke
  Scenario: Documents tab stays active on an existing envelope detail page
    When the user opens the envelope detail page for "abc-123"
    Then the primary nav highlights "Documents"
    And the primary nav does not highlight "Sign"

  @nav @smoke
  Scenario: Documents tab stays active on the post-send confirmation
    When the user opens the sent confirmation page for "abc-123"
    Then the primary nav highlights "Documents"
    And the primary nav does not highlight "Sign"

  @nav @smoke
  Scenario: Sign tab is active only on the new-envelope upload entry
    When the user opens the new envelope upload page
    Then the primary nav highlights "Sign"
