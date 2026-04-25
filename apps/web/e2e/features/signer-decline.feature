Feature: Recipient declines an envelope

  Background:
    Given a sealed envelope ready for signing

  @signer @regression @fixme
  Scenario: Recipient declines from the prep page
    When the recipient declines the envelope
    Then the signing-declined page is shown
