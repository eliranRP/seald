Feature: Old password links still land somewhere useful

  @auth @regression
  Scenario: A stale password-reset link opens the sign-in screen
    When the user opens the old forgot-password link
    Then the sign-in screen is shown
