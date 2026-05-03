Feature: Mobile hamburger only exposes Sign out
  # Per product (2026-05-03, refined) mobile users are locked to /m/send;
  # every desktop AppShell route bounces back here. The hamburger drawer
  # therefore exposes no nav links at all — a "Documents" tap would route
  # to /documents which the AppShell guard would immediately redirect
  # back to /m/send, a no-op that reads as broken. Identity + Sign out
  # only. Sign / Templates / Signers / Download my data / Delete account
  # are reached from desktop. This file pins that contract so a future
  # "let's just expose all the nav items again" regression is caught by
  # CI rather than by a frustrated mobile user.
  #
  # Templates is no longer reachable from the mobile sender at all (the
  # start-screen "From a template" tile was retired 2026-05-03 when the
  # templates list became unreachable on a phone). Its absence from the
  # hamburger is therefore part of a broader "templates is desktop-only"
  # contract.

  Background:
    Given a signed-in sender on a 390x844 phone
    And the sender visits /m/send

  @sender @smoke @mobile
  Scenario: Hamburger sheet shows the user profile and Sign out
    When the sender opens the mobile menu
    Then the mobile menu shows the user name "Alice Example"
    And the mobile menu shows the user email "alice@example.com"
    And the mobile menu has a "Sign out" button

  @sender @smoke @mobile
  Scenario: Hamburger sheet hides every nav affordance
    When the sender opens the mobile menu
    Then the mobile menu does not contain a "Documents" button
    And the mobile menu does not contain a "Sign" button
    And the mobile menu does not contain a "Templates" button
    And the mobile menu does not contain a "Signers" button
    And the mobile menu does not contain a "Download my data" button
    And the mobile menu does not contain a "Delete account" button

  @sender @smoke @mobile
  Scenario: Tapping Sign out in the hamburger lands on /signin
    When the sender opens the mobile menu
    And the sender taps the menu item "Sign out"
    Then the URL is /signin
