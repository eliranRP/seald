Feature: New account finishes setup on the welcome step

  @auth @smoke
  Scenario: Brand-new account adds a name and accepts the terms
    Given a signed-in account that has no profile name yet
    When the user completes the welcome step as "Casey New"
    Then the dashboard is shown

  @auth @regression
  Scenario: The signer Done page hand-off pre-fills the email
    When the user opens the sign-up page for "casey@example.com"
    Then the email field holds "casey@example.com"
    And a status says "Save your signed document to your account"
