Feature: Sender lifecycle regressions — dashboard responsiveness, dates, downloads

  These three scenarios pin the sender-side bugs surfaced by the
  qa/sender-lifecycle-bdd audit:
    BUG-1 (UI)    : the dashboard had zero media queries, so iPhone-class
                    viewports clipped the table columns and crushed the
                    StatGrid tiles to ~70px wide.
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
  Scenario: Dashboard rows stack into a single column on a phone-sized viewport (BUG-1)
    Given the viewport is sized to an iPhone (375x812)
    When the sender opens the dashboard
    Then the envelope row tiles do not overflow the viewport
    And the column-header strip is hidden

  @smoke @sender @regression
  Scenario: Older envelope dates include the year on the dashboard (BUG-2)
    When the sender opens the dashboard
    Then the row for the historical envelope shows its year
    And the row for the recent envelope omits the year

  @smoke @sender @regression
  Scenario: Download bundle opens the sealed PDF and downloads the audit trail (BUG-3)
    When the sender opens the recent envelope detail
    And the sender chooses the "Sealed PDF + audit" download bundle
    Then exactly one new tab opens for the sealed PDF
    And the audit trail is delivered as a download (no popup)
    And the success toast confirms the download
