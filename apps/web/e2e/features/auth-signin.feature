Feature: Sign in or create an account with a magic link

  @auth @smoke
  Scenario: Returning user asks for a sign-in link
    Given the magic-link API will succeed
    When the user asks for a sign-in link for "alice@example.com"
    Then the check-your-email screen names "alice@example.com"

  @auth @regression
  Scenario: A mistyped email is caught before anything is sent
    When the user asks for a sign-in link for "alice@example"
    Then an alert says "Check the email address"

  @auth @regression
  Scenario: A throttled send tells the user to wait
    Given the magic-link API is rate limited
    When the user asks for a sign-in link for "alice@example.com"
    Then an alert says "Too many tries. Wait 60 s."
