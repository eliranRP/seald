Feature: Mobile sender has a real navbar at /m/send
  # The mobile sender flow used to ship without any nav chrome — authed
  # users had no way to reach Documents / Templates / Signers or to
  # sign out. These scenarios prove the new MWMobileNav covers the gap
  # and that the "From a template" tile is now wired up to /templates.

  Background:
    Given a signed-in sender on a 375x667 phone
    And the sender visits /m/send

  @sender @smoke @mobile
  Scenario: Hamburger menu exposes profile and account actions
    When the sender opens the mobile menu
    Then the mobile menu shows the user name "Alice Example"
    And the mobile menu has a "Sign out" button
    And the mobile menu has a "Documents" nav button
    And the mobile menu has a "Templates" nav button

  @sender @smoke @mobile
  Scenario: Sign out from the hamburger lands on /signin
    When the sender opens the mobile menu
    And the sender taps the menu item "Sign out"
    Then the URL is /signin

  @sender @smoke @mobile
  Scenario: Tapping the From a template tile lands on /templates
    When the sender taps the "From a template" tile
    Then the URL is /templates
