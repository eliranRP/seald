Feature: Recipient signs an envelope end-to-end

  Background:
    Given a sealed envelope ready for signing

  @signer @smoke
  Scenario: Recipient completes the signing flow
    When the recipient signs and submits the envelope
    Then the signing-done page is shown
