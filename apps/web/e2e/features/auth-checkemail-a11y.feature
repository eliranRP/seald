Feature: Check-email confirmation announces success accessibly

  # Bug C regression (audit 2026-05-02): the "we sent a link to <email>"
  # confirmation must be a polite live region so screen-reader users hear
  # it on route entry. WCAG 2.1 SC 4.1.3 (Status Messages).

  @auth @a11y @smoke
  Scenario: Sign-in link confirmation is exposed as a live region
    When the user lands on the check-your-email screen for "alice@example.com"
    Then a polite live region announces the sign-in link was sent to "alice@example.com"
