Feature: Recipient guards against accidentally tapping "Not me?"
  # Critical-path: "Decline cleanly with a reason and never get spammed
  # again." A mistakenly-tapped Not me used to fire a one-shot decline
  # with no confirmation, terminating the envelope. The fix mirrors the
  # confirm dialog used for "Decline this request".

  Background:
    Given a sealed envelope ready for signing

  @signer @smoke @regression
  Scenario: Tapping Not me by accident does not decline the envelope
    When the recipient opens the signing link and lands on the prep page
    And the recipient taps "Not me?" but cancels the confirmation
    Then the recipient stays on the prep page

  @signer @regression
  Scenario: Confirming Not me declines and routes to the declined page
    When the recipient opens the signing link and lands on the prep page
    And the recipient taps "Not me?" and confirms the dialog
    Then the signing-declined page is shown
