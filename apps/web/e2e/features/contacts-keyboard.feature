Feature: Sender manages contacts using only the keyboard

  Adding is the fastest path to a new recipient for power users: type an
  address, press Enter, tab to Add, press Enter. Editing keeps its
  validation message on the field that caused it (an empty name is flagged
  on the name field, not under the email). These scenarios guard both
  keyboard-only paths.

  Background:
    Given a signed-in sender on the contacts page with a contact "Carla Diaz" "carla@example.com"

  @sender @smoke
  Scenario: Sender adds a contact by typing and pressing Enter
    When the sender opens the add contacts dialog
    And the sender types "nora@example.com" into the emails field
    And the sender presses Enter
    Then "nora@example.com" shows as a new email chip
    When the sender tabs to the add button and presses Enter
    Then the add contacts dialog closes
    And the confirmation "Contact added" is shown

  @sender @smoke
  Scenario: Validation error attaches to the field that caused it
    When the sender opens the edit dialog for "Carla Diaz"
    And the sender clears the name field
    And the sender saves the contact
    Then the name field shows the "Enter a name." error
    And the email field has no error
