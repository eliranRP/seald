Feature: Sender manages their contacts

  Background:
    Given a signed-in sender on the contacts page

  @sender @regression @fixme
  Scenario: Sender adds a new contact
    When the sender adds contact "Dana" "dana@example.com"
    Then "Dana" appears in the contacts list
