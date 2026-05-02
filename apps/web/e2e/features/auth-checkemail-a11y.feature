Feature: Check-email confirmation announces success accessibly

  # Bug C regression (audit 2026-05-02): the post-submit confirmation
  # ("we sent a link to <email>") used to render as a plain paragraph.
  # Screen-reader users navigating from /forgot-password lost all
  # context — the page heading "Check your email" repeats verbatim
  # across the reset and signup variants. The body must be a polite
  # live region with a mode-specific aria-label so AT can announce it
  # immediately on route entry. WCAG 2.1 SC 4.1.3 (Status Messages).

  @auth @a11y @smoke
  Scenario: Reset confirmation is exposed as a live region after a forgot-password submit
    Given the password-reset API will succeed
    When the user requests a reset for "alice@example.com"
    Then a polite live region announces the reset link was sent to "alice@example.com"

  @auth @a11y @smoke
  Scenario: Signup confirmation uses the signup-specific live-region label
    When the user lands on the signup confirmation for "alice@example.com"
    Then a polite live region announces the confirmation link was sent
