Feature: Recipient signs a document on a 390x844 phone
  # The recipient flow (entry → prep → fill → review → done) is shared
  # between desktop and mobile. A mobile signer regression typically
  # surfaces as one of three failure modes:
  #
  #   1. Caveat font fails to load (CSP or CORS) and the typed-signature
  #      preview falls back to the system serif. The font-family on the
  #      typed preview must include 'Caveat'.
  #   2. The sticky ActionBar overflows the 390-wide viewport and the
  #      Decline button slips off-screen. The mobile @media block at
  #      apps/web/src/pages/SigningFillPage/SigningFillPage.styles.ts
  #      lines 26–30 wraps the bar to two rows; both the progress count
  #      and the Decline button must remain in-viewport.
  #   3. The page-thumb rail (RailSlot, lines 184–200 of the same file)
  #      eats ~76px of horizontal space; on mobile it must be hidden.
  #
  # We use the existing `signedEnvelope` fixture (mocked /sign/* API
  # surface) instead of minting a real signer token at the API — the
  # e2e harness has no live API server. The fixture mirrors the wire
  # contract documented at apps/api/src/signing/signing.controller.spec.ts.

  Background:
    Given a sealed envelope ready for signing
    And the viewport is set to a 390x844 phone

  @signer @smoke @mobile
  Scenario: The signing prep page renders the T&C accept screen on mobile
    When the recipient opens the signing link and lands on the prep page
    Then the prep page Start signing button is visible

  @signer @smoke @mobile
  Scenario: The Caveat cursive font is in effect for the typed-signature preview
    When the recipient opens the signing link and lands on the prep page
    And the recipient agrees and continues to fill
    And the recipient opens the signature sheet
    And the recipient types "Bob Recipient" into the signature field
    Then the typed-signature preview uses the Caveat font

  @signer @smoke @mobile
  Scenario: The signing-fill ActionBar wraps to two rows so the Decline button stays reachable
    When the recipient opens the signing link and lands on the prep page
    And the recipient agrees and continues to fill
    Then the Decline button is visible inside the viewport
    And the page-thumb rail is hidden on mobile
