Feature: New user signs up + lands on dashboard

  @auth @smoke @fixme
  Scenario: Brand-new user creates an account
    Given the signup API will succeed
    When a new user signs up as "Casey New" with "casey@example.com"
    Then the dashboard greets the new user
