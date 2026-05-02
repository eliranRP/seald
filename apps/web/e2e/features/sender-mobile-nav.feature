Feature: Mobile sender has a real navbar at /m/send
  # The mobile sender flow used to ship without any nav chrome — authed
  # users had no way to reach Documents or sign out. These scenarios
  # prove the new MWMobileNav covers the gap and that the "From a
  # template" tile on the page is wired up to /templates.
  #
  # 2026-05-03: per product the hamburger collapsed to Documents +
  # Sign out only (Sign / Templates / Signers / Download / Delete were
  # pulled — see MWMobileNav.tsx header for rationale).

  Background:
    Given a signed-in sender on a 375x667 phone
    And the sender visits /m/send

  @sender @smoke @mobile
  Scenario: Hamburger menu exposes profile and account actions
    When the sender opens the mobile menu
    Then the mobile menu shows the user name "Alice Example"
    And the mobile menu has a "Sign out" button
    And the mobile menu has a "Documents" nav button

  @sender @smoke @mobile
  Scenario: Sign out from the hamburger lands on /signin
    When the sender opens the mobile menu
    And the sender taps the menu item "Sign out"
    Then the URL is /signin

  @sender @smoke @mobile
  Scenario: Tapping the From a template tile lands on /templates
    When the sender taps the "From a template" tile
    Then the URL is /templates
