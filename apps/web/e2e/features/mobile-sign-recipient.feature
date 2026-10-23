Feature: Recipient signs a document on a 390x844 phone
  # The recipient flow (entry → fill → done) is shared
  # between desktop and mobile. A mobile signer regression typically
  # surfaces as one of three failure modes:
  #
  #   1. Caveat font fails to load (CSP or CORS) and the typed-signature
  #      preview falls back to the system serif. The font-family on the
  #      typed preview must include 'Caveat'.
  #   2. The header overflows the 390-wide viewport and the More menu
  #      (home of Decline, Not me? and Withdraw consent) slips off-screen.
  #   3. The page scrolls sideways because a sheet, the sign bar or a
  #      field is wider than the viewport.
  #
  # We use the existing `signedEnvelope` fixture (mocked /sign/* API
  # surface) instead of minting a real signer token at the API — the
  # e2e harness has no live API server. The fixture mirrors the wire
  # contract documented at apps/api/src/signing/signing.controller.spec.ts.

  Background:
    Given a sealed envelope ready for signing
    And the viewport is set to a 390x844 phone

  @signer @smoke @mobile
  Scenario: The consent bar renders on mobile
    When the recipient opens the signing link and lands on the document
    Then the consent bar Start button is visible

  @signer @smoke @mobile
  Scenario: The Caveat cursive font is in effect for the typed-signature preview
    When the recipient opens the signing link and lands on the document
    And the recipient agrees and starts
    And the recipient opens the signature sheet
    And the recipient types "Bob Recipient" into the signature field
    Then the typed-signature preview uses the Caveat font

  @signer @smoke @mobile
  Scenario: The More menu stays reachable and the page does not scroll sideways
    When the recipient opens the signing link and lands on the document
    And the recipient agrees and starts
    Then the header More menu is visible inside the viewport
    And the page fits the viewport width
