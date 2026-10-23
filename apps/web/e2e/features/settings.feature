Feature: Settings sections and account actions
  # Redesign v2: /settings opens Profile, with Signature, Notifications,
  # Integrations and Account beside it. Delete account is a type-DELETE
  # dialog, not a browser prompt.

  Background:
    Given the sender is signed in with saved settings

  @settings @smoke
  Scenario: Settings opens on Profile and lists the sections
    When the sender opens "/settings"
    Then the page is at "/settings/profile"
    And the settings navigation lists "Profile, Signature, Notifications, Integrations, Account"
    And the "Full name" field shows "Alice Example"

  @settings @smoke
  Scenario: Completed and declined notifications are locked on
    When the sender opens "/settings/notifications"
    Then the "Completed" switch is on and cannot be changed
    And the "Declined, expired, bounced" switch is on and cannot be changed
    And the "Daily summary" switch is off

  @settings @smoke
  Scenario: Delete account stays disabled until DELETE is typed
    When the sender opens "/settings/account"
    And the sender chooses Delete
    Then the "Delete account" button is disabled
    When the sender types "DELETE" to confirm
    Then the "Delete account" button is enabled
