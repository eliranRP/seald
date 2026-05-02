Feature: Mobile hamburger only exposes Documents and Sign out
  # Per product (2026-05-03, PR #111) the mobile hamburger is the
  # de-cluttered "essentials only" surface for someone who is in the
  # middle of sending a document on their phone. The dashboard
  # (Documents) is the only navigation destination; the only account
  # action is Sign out. Sign / Templates / Signers / Download my data /
  # Delete account were intentionally pulled — anyone needing those
  # tasks reaches them on desktop. This file pins that contract so a
  # future "let's just expose all the nav items again" regression is
  # caught by CI rather than by a frustrated mobile user.
  #
  # Templates is reachable from the start-screen "From a template" CTA
  # (asserted by sender-mobile-nav.feature) — its absence from the
  # hamburger is the deliberate complement.

  Background:
    Given a signed-in sender on a 390x844 phone
    And the sender visits /m/send

  @sender @smoke @mobile
  Scenario: Hamburger sheet shows the user profile, Documents, and Sign out
    When the sender opens the mobile menu
    Then the mobile menu shows the user name "Alice Example"
    And the mobile menu shows the user email "alice@example.com"
    And the mobile menu has a "Documents" nav button
    And the mobile menu has a "Sign out" button

  @sender @smoke @mobile
  Scenario: Hamburger sheet hides every non-essential affordance
    When the sender opens the mobile menu
    Then the mobile menu does not contain a "Sign" button
    And the mobile menu does not contain a "Templates" button
    And the mobile menu does not contain a "Signers" button
    And the mobile menu does not contain a "Download my data" button
    And the mobile menu does not contain a "Delete account" button

  @sender @smoke @mobile
  Scenario: Tapping Documents in the hamburger navigates to /documents and closes the sheet
    When the sender opens the mobile menu
    And the sender taps the menu item "Documents"
    Then the URL is /documents
    And the mobile menu sheet is closed

  @sender @smoke @mobile
  Scenario: Tapping Sign out in the hamburger lands the guest on /signin
    When the sender opens the mobile menu
    And the sender taps the menu item "Sign out"
    Then the URL is /signin
