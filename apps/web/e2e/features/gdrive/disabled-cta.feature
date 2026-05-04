Feature: Drive picker CTA — inline OAuth connect from Sign + Template flows
  # Phase 6.A iter-1 round-1 LOCAL bug. Found 2026-05-03 walking the
  # gdrive feature surface end-to-end on localhost.
  #
  # Pre-fix: When `feature.gdriveIntegration` is ON but the user has not
  # connected a Google account, both Drive entry points (the
  # `/document/new` source card AND the `/templates/:id/use` Step 1
  # "Upload a new one" panel) render a `<button disabled title="Connect
  # Google Drive in Settings to use this.">`. Three a11y failures:
  #   1. The native `title` attribute is not announced by NVDA / VoiceOver
  #      on disabled buttons.
  #   2. Disabled buttons aren't focusable, so keyboard users get no
  #      affordance at all.
  #   3. Touch users never see a hover tooltip.
  # Net effect: a dead-end CTA. The user is told "go to Settings" only
  # if they have a desktop pointer device AND they happen to hover for
  # ~1s. There is no clickable path from these surfaces to
  # `/settings/integrations`.
  #
  # Post-fix (2026-05-04, commit 901515b): the previous fix navigated to
  # `/settings/integrations`, which broke flow continuity (the user lost
  # their upload context). The current contract is stricter: when
  # `connected=false`, the surface MUST render an enabled, focusable
  # "Connect Google Drive" button that opens the OAuth popup INLINE via
  # `useConnectGDrive().mutate()`. The popup posts back through the
  # AppShell-mounted message listener and the accounts query flips to
  # connected without leaving the wizard. No reliance on `title`. No
  # navigation away from the current route on activation.

  Background:
    Given the gdriveIntegration feature flag is on
    And no Google Drive account is connected for the signed-in user
    And the Drive OAuth URL endpoint returns a stubbed consent URL

  @gdrive @a11y @smoke
  Scenario: /document/new exposes an enabled "Connect Google Drive" CTA that opens OAuth inline
    When the sender visits "/document/new"
    Then the Drive source card renders a button with accessible name matching /connect google drive/i
    And that button is not disabled
    And activating that button opens the Drive OAuth popup without leaving "/document/new"
    And no element on the page relies on the native `title` attribute to convey the connect-in-settings hint

  @gdrive @a11y @smoke
  Scenario: /templates/:id/use Upload-new step exposes an enabled "Connect Google Drive" CTA that opens OAuth inline
    Given a template with id "475e2154-b1f8-45ee-877a-be8a0ef1eb67" exists
    When the sender visits "/templates/475e2154-b1f8-45ee-877a-be8a0ef1eb67/use"
    And the sender selects the "Upload a new one" document source
    Then the Drive replace button renders with accessible name matching /connect google drive/i
    And that button is not disabled
    And activating that button opens the Drive OAuth popup without leaving "/templates/475e2154-b1f8-45ee-877a-be8a0ef1eb67/use"
