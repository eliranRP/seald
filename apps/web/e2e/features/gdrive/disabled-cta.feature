Feature: Drive picker CTA — accessible path to Settings when no account is connected
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
  # Post-fix: when `connected=false`, the surface MUST render an
  # enabled, focusable affordance whose visible label and accessible
  # name include "Connect" and which navigates to
  # `/settings/integrations` on activation. No reliance on `title`.

  Background:
    Given the gdriveIntegration feature flag is on
    And no Google Drive account is connected for the signed-in user

  @gdrive @a11y @smoke
  Scenario: /document/new exposes an enabled "Connect Drive in Settings" CTA
    When the sender visits "/document/new"
    Then the Drive source card renders a button with accessible name matching /connect.*settings/i
    And that button is not disabled
    And activating that button navigates to "/settings/integrations"
    And no element on the page relies on the native `title` attribute to convey the connect-in-settings hint

  @gdrive @a11y @smoke
  Scenario: /templates/:id/use Upload-new step exposes an enabled "Connect Drive in Settings" CTA
    Given a template with id "475e2154-b1f8-45ee-877a-be8a0ef1eb67" exists
    When the sender visits "/templates/475e2154-b1f8-45ee-877a-be8a0ef1eb67/use"
    And the sender selects the "Upload a new one" document source
    Then the Drive replace button renders with accessible name matching /connect.*settings/i
    And that button is not disabled
    And activating that button navigates to "/settings/integrations"
