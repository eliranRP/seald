Feature: Forgot password flow

  @auth @regression
  Scenario: User requests a password reset email
    Given the password-reset API will succeed
    When the user requests a reset for "alice@example.com"
    Then a reset confirmation is shown
