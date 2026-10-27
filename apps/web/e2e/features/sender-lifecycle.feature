Feature: Sender lifecycle regressions — dashboard responsiveness, dates, downloads

  These three scenarios pin the sender-side bugs surfaced by the
  qa/sender-lifecycle-bdd audit:
    BUG-1 (UX)    : superseded 2026-05-03 — see scenario note below.
                    Originally about retrofitting media queries onto the
                    desktop dashboard for an iPhone viewport. Per
                    product, mobile users are now locked to /m/send so
                    the dashboard never renders on a phone; the new
                    contract is "redirect, don't degrade".
    BUG-2 (UX)    : envelope dates rendered without the year on every
                    sender surface, so PMs could not distinguish an
                    envelope sent last month from one sent two years ago.
    BUG-3 (UI)    : the "Sealed PDF + audit trail" download bundle fired
                    two `target="_blank"` anchors back-to-back, which
                    Chrome / Safari popup-blockers swallow on the second
                    click while the success toast lied that both opened.

  Background:
    Given a signed-in sender with a historical and a recent envelope

  @smoke @sender @regression
  Scenario: Mobile sender opening the dashboard stays on the responsive dashboard (BUG-1, redesign v2)
    # Redesign v2 retires the mobile lock to /m/send: /documents is
    # responsive and phones get a bottom nav instead of a redirect.
    Given the viewport is sized to an iPhone (375x812)
    When the sender opens the dashboard
    Then the URL is /documents

  @smoke @sender @regression
  Scenario: Older envelope dates include the year on the dashboard (BUG-2)
    When the sender opens the dashboard
    Then the row for the historical envelope shows its year
    And the row for the recent envelope omits the year

  @smoke @sender @regression
  Scenario: Download opens only the sealed PDF; the audit trail stays separate (BUG-3)
    When the sender opens the recent envelope detail
    And the sender clicks the main Download button
    Then exactly one new tab opens for the sealed PDF
    And the audit trail is not fetched with it
    And the success toast confirms the sealed PDF opened
