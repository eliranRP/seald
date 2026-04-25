Feature: Signing-link error states

  @signer @regression @fixme
  Scenario: Recipient opens an expired link
    Given a sealed envelope that is "expired"
    When the recipient opens the signing link
    Then the recipient sees an "expired" notice

  @signer @regression @fixme
  Scenario: Recipient opens a burned link
    Given a sealed envelope that is "burned"
    When the recipient opens the signing link
    Then the recipient sees a "burned" notice
