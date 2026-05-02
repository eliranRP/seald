Feature: Sender confirms or dismisses template deletion

  The templates list lets a sender remove a template they no longer
  reuse. The destructive action is gated behind a confirmation modal.
  Bug A (regression closed 2026-05-02) blocked Escape from dismissing
  the modal — keyboard-only users had no way out short of confirming
  the destructive action, violating WCAG 2.1.2 (No Keyboard Trap).
  This scenario guards the dismissal path.

  Background:
    Given a signed-in sender on the templates page with a template named "Quarterly NDA"

  @sender @smoke
  Scenario: Sender dismisses delete confirmation with Escape
    When the sender clicks Delete on the "Quarterly NDA" template
    Then the delete confirmation for "Quarterly NDA" is open
    When the sender presses Escape
    Then the delete confirmation for "Quarterly NDA" is closed
    And the "Quarterly NDA" template is still in the list
