Feature: Existing user signs in

  @auth @smoke @fixme
  Scenario: Returning user signs in with valid credentials
    Given the signin API will succeed for "alice@example.com"
    When the user signs in as "alice@example.com" with password "hunter2"
    Then the dashboard is shown
