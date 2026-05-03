Feature: Drive integration modals — a11y, focus, and error feedback
  # Phase 6.A iter-2 LOCAL batch. Found 2026-05-03 walking the gdrive
  # feature surface end-to-end on localhost (round 2 — after the
  # disabled-CTA batch landed in PR #126).
  #
  # Four bugs found by close code-reading + dev-harness preview:
  #
  #   Bug A — DrivePicker initial focus lands on the Close (X) button
  #     instead of the Search input. A keyboard-only user opening the
  #     picker is one Tab away from dismissing it. Querying for
  #     `input, button` returns the first focusable in DOM order, and
  #     the CloseButton sits before the SearchInput in the Header.
  #
  #   Bug B — DisconnectModal has no Tab focus trap. Tab from any
  #     focusable inside the alertdialog escapes to the underlying
  #     IntegrationsPage (Connect button, header links). Violates
  #     WCAG 2.1.2 (No Keyboard Trap) which mandates BOTH directions:
  #     a modal must trap focus AND release on close.
  #
  #   Bug C — DisconnectModal silently swallows mutation errors. When
  #     DELETE /integrations/gdrive/accounts/:id rejects, the modal's
  #     pending state clears but no UI feedback surfaces. The user
  #     cannot tell whether the click registered.
  #
  #   Bug D — IntegrationsPage 503 config-error alert cannot be
  #     dismissed. On the empty-state surface the user is led to click
  #     Connect to discover the misconfig, then the alert sits on top
  #     of the page until they attempt another mutate. No path back
  #     to a clean view.

  Background:
    Given the gdriveIntegration feature flag is on

  @gdrive @a11y
  Scenario: DrivePicker opens with initial focus on the Search input
    Given a Google Drive account is connected for the signed-in user
    When the sender opens the Drive picker on "/document/new"
    Then initial focus is on the Search input
    And the Close (X) button does not have focus

  @gdrive @a11y
  Scenario: DisconnectModal traps Tab focus inside the alertdialog
    Given a Google Drive account is connected for the signed-in user
    When the sender opens the Disconnect confirm modal on "/settings/integrations"
    And the sender focuses the last focusable inside the modal
    And the sender presses Tab
    Then focus stays inside the alertdialog

  @gdrive @error-handling
  Scenario: DisconnectModal surfaces an inline error when the mutation fails
    Given a Google Drive account is connected for the signed-in user
    And the disconnect endpoint will reject with HTTP 500
    When the sender confirms Disconnect on "/settings/integrations"
    Then the alertdialog stays open
    And an alert appears inside the modal with text matching /couldn.?t disconnect/i
    And the Cancel and Disconnect buttons are both enabled for retry

  @gdrive @error-handling
  Scenario: 503 oauth-not-configured alert is dismissible
    Given no Google Drive account is connected for the signed-in user
    And the oauth url endpoint will reject with HTTP 503 "gdrive_oauth_not_configured"
    When the sender clicks "Connect Google Drive" on "/settings/integrations"
    Then a configuration alert appears with text matching /not configured/i
    When the sender clicks the alert's Dismiss button
    Then the configuration alert is removed
