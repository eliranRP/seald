Feature: Sender manages their contacts

  Background:
    Given a signed-in sender on the contacts page

  @sender @regression
  Scenario: Sender adds several contacts from a pasted list
    When the sender opens the add contacts dialog
    And the sender pastes "dana@example.com, sam@example.com, dana@example.com, nope@@x" into the emails field
    Then the add contacts summary reads "2 new · 1 already saved · 1 invalid"
    And the add button reads "Add 2"
    When the sender confirms adding the contacts
    Then the confirmation "2 contacts added" is shown

  @sender @regression
  Scenario: Sender sees the people they send to
    Given the sender already has the contact "Dana Kim" "dana@example.com"
    Then "Dana Kim" appears in the contacts list
