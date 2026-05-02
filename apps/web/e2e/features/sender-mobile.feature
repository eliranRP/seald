Feature: Sender sends a document from a phone-sized viewport
  # Critical-path: sender opens seald.nromomentum.com on their phone
  # while signed in and lands on the new mobile-web send flow at
  # /m/send (NOT the desktop dashboard table). Six-step flow:
  # start → file → signers → place → review → sent.

  Background:
    Given a signed-in sender on a 375x667 phone

  @sender @smoke @mobile
  Scenario: Mobile sender lands on /m/send not /documents
    When the sender visits the root
    Then the URL is /m/send
    And the "New document" heading is visible
    And the "Upload PDF" tile is visible inside the viewport

  @sender @smoke @mobile
  Scenario: Mobile sender uploads a PDF and reaches the place step
    When the sender taps "Upload PDF" and picks a sample PDF
    And the sender taps Continue
    And the sender taps "Add me as signer"
    And the sender taps "Next: place fields"
    Then the place-fields step is visible
    And the field-type chips toolbar is visible

  @sender @smoke @mobile
  Scenario: Mobile sender places a Signature for two signers and sees two side-by-side fields
    Given the sender is on the place step with two signers configured
    When the sender taps the Signature chip
    And the sender taps the page canvas
    Then the assigned-signers sheet is open
    When the sender taps Apply on the signers sheet
    Then two single-signer Signature fields are placed on the page

  @sender @smoke @mobile
  Scenario: Mobile sender sends and reaches the Sent screen
    Given the sender is on the place step with one signer
    When the sender drops a Signature field
    And the sender taps Review
    And the sender taps "Send for signature"
    Then the Sent screen is visible
