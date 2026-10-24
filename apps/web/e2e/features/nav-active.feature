Feature: Primary nav active-tab indicator follows the IA
  # Redesign v2: the desktop nav is Documents · Templates · Contacts. The
  # old "Sign" tab is gone — "New document" is the Documents page's primary
  # action — so every /document/* surface keeps Documents lit.

  Background:
    Given the user is signed in as "alice@example.com"

  @nav @smoke
  Scenario: Documents tab stays active on the dashboard
    When the user opens the Documents dashboard
    Then the primary nav highlights "Documents"

  # Bug A regression (audit 2026-05-02): existing-envelope detail and the
  # post-send confirmation are entered from Documents.
  @nav @smoke
  Scenario: Documents tab stays active on an existing envelope detail page
    When the user opens the envelope detail page for "abc-123"
    Then the primary nav highlights "Documents"
    And the primary nav does not highlight "Templates"

  @nav @smoke
  Scenario: Documents tab stays active on the post-send confirmation
    When the user opens the sent confirmation page for "abc-123"
    Then the primary nav highlights "Documents"
    And the primary nav does not highlight "Contacts"

  @nav @smoke
  Scenario: Documents tab stays active on the new-envelope upload entry
    When the user opens the new envelope upload page
    Then the primary nav highlights "Documents"
    And the primary nav has no "Sign" tab
