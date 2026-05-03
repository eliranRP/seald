Feature: Mobile sender has a real navbar at /m/send
  # The mobile sender flow used to ship without any nav chrome — authed
  # users had no way to sign out. The MWMobileNav closes that gap. Per
  # product (2026-05-03, refined twice): mobile users are locked to
  # /m/send; every desktop AppShell route bounces back here, so the
  # hamburger exposes no nav links at all (Documents / Templates /
  # Signers / Download my data / Delete account are reached from
  # desktop). Identity + Sign out only. Templates was previously
  # reachable from a start-screen "From a template" CTA; that tile was
  # removed when the templates list became unreachable from a phone.

  Background:
    Given a signed-in sender on a 375x667 phone
    And the sender visits /m/send

  @sender @smoke @mobile
  Scenario: Hamburger menu exposes profile and Sign out
    When the sender opens the mobile menu
    Then the mobile menu shows the user name "Alice Example"
    And the mobile menu has a "Sign out" button

  @sender @smoke @mobile
  Scenario: Sign out from the hamburger lands on /signin
    When the sender opens the mobile menu
    And the sender taps the menu item "Sign out"
    Then the URL is /signin
