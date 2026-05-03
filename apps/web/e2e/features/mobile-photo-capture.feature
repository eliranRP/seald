Feature: Mobile sender uploads a PDF and is rejected on empty files
  # The MWStart screen exposes a hidden file input so the user can pick
  # a PDF from their phone. Two regressions matter here:
  #
  #   1. Happy path — picking a real single-page PDF must advance to
  #      the MWSigners screen ("Who needs to sign this?"). Earlier the
  #      sender tile briefly required two taps; this scenario locks the
  #      single-tap → advance contract.
  #   2. Boundary — a 0-byte PDF must be rejected at the picker with an
  #      inline alert that mentions "empty". Mirrors the vitest spec at
  #      apps/web/src/pages/MobileSendPage/MobileSendPage.test.tsx so the
  #      real Vite dev server + pdf.js path is exercised end-to-end and
  #      not just JSDOM.
  #
  # Viewport pinned to 390x844 (iPhone 14 default). The mobile-only
  # router gate fires at ≤640px so this is well inside it.

  Background:
    Given a signed-in sender on a 390x844 phone
    And the sender visits /m/send

  @sender @smoke @mobile
  Scenario: Picking a valid PDF advances to the file-confirm step
    When the sender uploads the sample PDF named "mobile-photo.pdf"
    Then the file-confirm step shows the picked filename "mobile-photo.pdf"

  @sender @smoke @mobile
  Scenario: Picking a valid PDF and tapping Continue advances to the signers step
    When the sender uploads the sample PDF named "mobile-photo.pdf"
    And the sender taps Continue
    Then the place-fields stepper label "Who is signing?" is visible

  @sender @smoke @mobile
  Scenario: A 0-byte PDF is rejected with an inline empty-file alert
    When the sender uploads an empty PDF named "blank.pdf"
    Then an inline alert mentions "blank.pdf"
    And the inline alert mentions "empty"
    And the file-confirm step is not shown
