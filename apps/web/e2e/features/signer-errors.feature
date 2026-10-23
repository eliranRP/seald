Feature: Signing-link error states

  @signer @regression
  Scenario: Recipient opens an expired link
    Given a sealed envelope that is "expired"
    When the recipient opens the signing link
    Then the recipient sees the "Link expired" screen

  @signer @regression
  Scenario: Recipient opens a link they already used
    Given a sealed envelope that is "signed"
    When the recipient opens the signing link
    Then the recipient sees the "Already signed" screen

  @signer @regression
  Scenario: Recipient opens a link that is not valid
    Given a sealed envelope that is "invalid"
    When the recipient opens the signing link
    Then the recipient sees the "Link not valid" screen
