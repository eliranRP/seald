Feature: Sender adds a signer using only the keyboard

  The contacts dialog is the fastest path to a new signer for power
  users. Bug B (regression closed 2026-05-02) blocked Enter-to-submit
  inside the dialog because the inputs lacked any keydown handler;
  Bug C surfaced the wrong field's validation error. These scenarios
  guard the keyboard-only happy path + keyboard-only validation
  feedback so neither regresses.

  Background:
    Given a signed-in sender on the contacts page with the API ready to accept "Carla" "carla@example.com"

  @sender @smoke
  Scenario: Sender adds a signer by pressing Enter inside the dialog
    When the sender opens the add-signer dialog
    And the sender types "Carla" into the name field
    And the sender types "carla@example.com" into the email field
    And the sender presses Enter
    Then the add-signer dialog closes
    And "Carla" appears in the contacts list

  @sender @smoke
  Scenario: Validation error attaches to the field that caused it
    When the sender opens the add-signer dialog
    And the sender types "carla@example.com" into the email field
    And the sender submits the dialog
    Then the name field shows the "Please enter a name." error
    And the email field has no error
