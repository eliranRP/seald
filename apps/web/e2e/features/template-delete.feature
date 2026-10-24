Feature: Sender confirms, dismisses or undoes template deletion

  The templates list lets a sender remove a template they no longer
  reuse. The destructive action is gated behind a confirmation, and after
  it a toast offers Undo. Escape dismisses the confirmation without
  deleting (WCAG 2.1.2, No Keyboard Trap).

  Background:
    Given a signed-in sender on the templates page with a template named "Quarterly NDA"

  @sender @smoke
  Scenario: Sender dismisses delete confirmation with Escape
    When the sender clicks Delete on the "Quarterly NDA" template
    Then the delete confirmation for "Quarterly NDA" is open
    When the sender presses Escape
    Then the delete confirmation for "Quarterly NDA" is closed
    And the "Quarterly NDA" template is still in the list

  @sender @regression
  Scenario: Sender deletes a template and undoes it
    When the sender clicks Delete on the "Quarterly NDA" template
    And the sender confirms the deletion
    Then the "Quarterly NDA" template is no longer in the list
    And the confirmation "Template deleted" is shown
    When the sender taps Undo
    Then the "Quarterly NDA" template is still in the list
