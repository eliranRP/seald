Feature: Recipient declines an envelope

  Background:
    Given a sealed envelope ready for signing

  @signer @regression
  Scenario: Recipient declines from the More menu
    When the recipient declines the envelope
    Then the signing-declined page is shown
