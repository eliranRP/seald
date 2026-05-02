Feature: Mobile sender starts a document from a saved template
  # Templates is the third start option on the MWStart screen. Per
  # product (2026-05-03, PR #111), the hamburger no longer carries a
  # Templates entry — the start-screen tile is the only mobile path
  # in. The complementary "Templates is absent from the hamburger"
  # contract lives in mobile-hamburger.feature; this file pins the
  # positive path.
  #
  # Picking a template sends the user to /templates/:id/use, which is
  # the shared (desktop+mobile) UseTemplatePage flow. The "land on the
  # mobile field-placement step" task is asserted by the URL transition
  # to /templates/:id/use rather than the in-page step name, because
  # UseTemplatePage doesn't currently mount a separate /m/place route —
  # it reuses the desktop editor with the responsive layout from
  # SigningFillPage.styles.ts (asserted in mobile-sign-recipient).

  Background:
    Given a signed-in sender on a 390x844 phone
    And a template named "Quarterly NDA" is available

  @sender @smoke @mobile
  Scenario: From a template tile on /m/send navigates to /templates
    When the sender visits /m/send
    And the sender taps the "From a template" tile
    Then the URL is /templates

  @sender @smoke @mobile
  Scenario: Picking a template card from the list opens the use flow
    When the sender visits /m/send
    And the sender taps the "From a template" tile
    And the sender taps the "Quarterly NDA" template card
    Then the URL is on the use-template flow
