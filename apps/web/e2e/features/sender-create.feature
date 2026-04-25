Feature: Sender uploads a PDF and sends an envelope

  Background:
    Given a signed-in sender on the new-document page

  @sender @smoke @fixme
  Scenario: Sender ships a single-signer envelope
    When the sender uploads a sample PDF and adds signer "Bob" "bob@example.com"
    Then the sent confirmation page is shown
