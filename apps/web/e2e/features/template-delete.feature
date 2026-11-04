Feature: Sender deletes a template and can undo it

  The templates list lets a sender remove a template they no longer
  reuse. The delete is a soft delete, so it acts at once and the toast
  offers Undo instead of asking "Are you sure?" first (undo over confirm).

  Background:
    Given a signed-in sender on the templates page with a template named "Quarterly NDA"

  @sender @smoke
  Scenario: Sender deletes a template and undoes it
    When the sender clicks Delete on the "Quarterly NDA" template
    Then the "Quarterly NDA" template is no longer in the list
    And the confirmation "Quarterly NDA deleted" is shown
    When the sender taps Undo
    Then the "Quarterly NDA" template is still in the list
