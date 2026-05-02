Feature: Recipient signs from a phone-sized viewport
  # Critical-path: "Open the email link on my phone, sign in 30 seconds
  # without making an account." Top-frequency entry point — most signers
  # open from a Gmail/iOS Mail link on mobile.

  Background:
    Given a sealed envelope ready for signing

  @signer @smoke
  Scenario: Recipient completes signing on a 375px viewport
    Given the viewport is set to a 375x667 phone
    When the recipient signs and submits the envelope
    Then the signing-done page is shown

  @signer @smoke
  Scenario: The bottom-sheet Apply button stays reachable on a phone
    # Regression for the iOS-keyboard / safe-area bug — the bottom sheet
    # used to put its footer below the visual viewport, leaving the user
    # with no way to commit a typed value or dismiss the modal.
    Given the viewport is set to a 375x667 phone
    When the recipient opens the signing link and lands on the prep page
    And the recipient agrees and continues to fill
    And the recipient opens the signature sheet
    Then the sheet "Apply" button is visible inside the viewport

  @signer @smoke @mobile
  Scenario: Mobile recipient signs a real PDF end-to-end at 375x667
    # Proves the signer flow (entry → prep → fill → review → done) is
    # usable on a phone-sized viewport WITH a real parseable PDF served
    # at /pdf-fixture.pdf. Earlier the stub `%PDF-1.4...` masked any
    # canvas regression because pdf.js never reached the loaded state.
    Given the viewport is set to a 375x667 phone
    When the recipient signs and submits the envelope
    Then the signing-done page is shown
