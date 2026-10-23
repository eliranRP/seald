/**
 * MCP parity registry (docs/design/mcp-server.md, MCP-first rule 3, and
 * parity plan decision D5). Every sender route, meaning every route the
 * global Supabase AuthGuard protects, maps to one of:
 *
 * - `{ tool }`: the shipped tool that covers it;
 * - `{ planned }`: the pull-request step (`step-N`, or `step-aN` for the
 *   automations track in workflow-automations.md) that will ship its
 *   tool (`WP-45`, the approval-gated account and key actions, shipped);
 * - `{ excluded }`: only for a route with no agent-facing action (a
 *   signer-link, verify, cron or OAuth browser redirect route), the
 *   owner's own Approve / Deny / review re-mint (the human side of an
 *   approval, browser-only per D5), or an owner-side route the design
 *   leaves to the app (`owner_in_app_only`, WP-26).
 *
 * `@Public()` routes (signing, verify, cron, health, the OAuth callback
 * and `/mcp` itself) are skipped by decorator in
 * `route-coverage.contract.spec.ts`, not listed here by hand.
 *
 * Every tool pull request moves its routes from `planned` to `tool` and
 * adds its step to `SHIPPED_STEPS`.
 */

/** Steps whose tools have shipped. A `planned` entry may not name one. */
export const SHIPPED_STEPS = [
  'step-4',
  'step-5',
  'step-6',
  'step-7c',
  'step-8a',
  'step-8b',
  'step-8c',
  'step-8d',
  'step-9',
  // WP-30: automations A3. The /automations owner routes (WP-31) map to these tools.
  'step-a3',
  'step-12',
  'step-13',
  'step-14',
  'step-10',
  'step-11',
  // WP-26: the "Later" list.
  'step-15',
  // WP-45 (D5): the approval-gated account, key and owner-signing tools.
  'WP-45',
] as const;

export const EXCLUSION_REASONS = [
  'signer_link',
  'verify',
  'cron',
  'oauth_browser_redirect',
  // WP-21 (D5): the owner's own Approve / Deny is the human side of an
  // approval. An agent asking for it would approve itself; there is no
  // `approvals_decide` tool by design.
  'owner_approval_decision',
  // WP-26 (MCP step 15). The design doc's "Later" list names no tool for
  // these owner-side routes, and each hands an agent something a tool call
  // cannot carry safely: a file body (the template example PDF, which the
  // staged upload flow does not cover), a public entry point anyone holding
  // the link can use (a template's direct link, whose create/rotate/revoke
  // is an owner decision with no approval kind), or the stop button on a
  // send the owner already approved (bulk batch cancel), plus the owner's own
  // oversight list of what agents did (`GET /agent-activity`). The contract
  // spec pins the exact routes this reason may cover, so a new route cannot
  // hide under it, and every entry's note says which case it is.
  'owner_in_app_only',
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export type PlannedStep = `step-${string}` | 'WP-45';

export type RouteCoverage =
  | { readonly tool: string }
  | { readonly planned: PlannedStep }
  | { readonly excluded: ExclusionReason; readonly note: string };

export const ROUTE_COVERAGE: Readonly<Record<string, RouteCoverage>> = {
  // Account
  'GET /me': { tool: 'me_get' },
  // WP-45 (D5): each acts only after the owner approves with a fresh sign-in.
  'GET /me/export': { tool: 'account_export' },
  'DELETE /me': { tool: 'account_delete' },
  'GET /me/api-keys': { tool: 'api_keys_list' },
  'POST /me/api-keys': { tool: 'api_keys_create' },
  'POST /me/api-keys/:id/revoke': { tool: 'api_keys_revoke' },
  // WP-27 connected apps (OAuth grants), next to keys (WP-45): revoke waits on the owner.
  'GET /me/connected-apps': { tool: 'connected_apps_list' },
  'POST /me/connected-apps/:id/revoke': { tool: 'connected_apps_revoke' },
  // WP-27: the OAuth consent page's API. The owner's browser approves an
  // app; an agent calling it would grant itself access.
  'POST /oauth/consent/describe': {
    excluded: 'oauth_browser_redirect',
    note: 'Consent page read for the OAuth authorization flow; the owner, not an agent, consents.',
  },
  'POST /oauth/consent': {
    excluded: 'oauth_browser_redirect',
    note: 'The owner approves or denies an OAuth client in the browser; an agent would grant itself.',
  },

  // Envelopes
  'GET /envelopes': { tool: 'envelopes_search' },
  'POST /envelopes': { tool: 'envelopes_create' },
  'GET /envelopes/:id': { tool: 'envelopes_get' },
  'PATCH /envelopes/:id': { tool: 'envelopes_update' },
  'PUT /envelopes/:id/signing-order': { tool: 'envelopes_set_recipient_order' },
  // WP-10 signer access-code settings (WP-26, step 15).
  'GET /envelopes/:id/access-auth': { tool: 'envelopes_get_access_auth' },
  'PATCH /envelopes/:id/access-auth': { tool: 'envelopes_set_access_auth' },
  'DELETE /envelopes/:id': { tool: 'envelopes_delete_draft' },
  'POST /envelopes/:id/upload': { tool: 'envelopes_upload_pdf' },
  // WP-24: through owner approval (envelopes_preview_send / _preview_remind preview them).
  'POST /envelopes/:id/send': { tool: 'envelopes_send' },
  'POST /envelopes/:id/cancel': { tool: 'envelopes_cancel' },
  'POST /envelopes/:id/unsend': {
    excluded: 'owner_in_app_only',
    note: 'Undo toast in the app, 10 s after Send; an agent has cancel and update instead.',
  },
  'POST /envelopes/:id/signers/:signer_id/remind': { tool: 'envelopes_remind' },
  'POST /envelopes/:id/signers': { tool: 'envelopes_add_signer' },
  'DELETE /envelopes/:id/signers/:signer_id': { tool: 'envelopes_remove_signer' },
  'PATCH /envelopes/:id/signers/:signer_id': { tool: 'envelopes_fix_signer' },
  // Envelope detail redesign: replace a signer. No tool yet.
  'POST /envelopes/:id/signers/:signer_id/replace': { planned: 'step-16' },
  // WP-19 ships placement; suggestions (envelopes_suggest_fields, step 9) have no route.
  'PUT /envelopes/:id/fields': { tool: 'envelopes_place_fields' },
  'GET /envelopes/:id/events': { tool: 'envelopes_list_events' },
  'GET /envelopes/:id/download': { tool: 'envelopes_download_url' },
  'POST /envelopes/:id/gdrive/save': { tool: 'envelopes_save_to_drive' },

  // Documents of an envelope (WP-03)
  'GET /envelopes/:id/documents': { tool: 'envelopes_get' },
  'POST /envelopes/:id/documents': { tool: 'envelopes_add_document' },
  'PUT /envelopes/:id/documents/order': { tool: 'envelopes_reorder_documents' },
  'DELETE /envelopes/:id/documents/:document_id': { tool: 'envelopes_remove_document' },

  // Owner approvals (WP-21). The queue reads map to the agent's status
  // tools; the decisions are the owner's own and never a tool. The
  // email-link routes (`/approvals/from-email*`) are @Public().
  'GET /approvals': { tool: 'approvals_list' },
  'GET /approvals/:id': { tool: 'approvals_get' },
  'POST /approvals/:id/approve': {
    excluded: 'owner_approval_decision',
    note: 'The owner approves in Seald with a fresh sign-in; an agent tool here would approve itself.',
  },
  'POST /approvals/:id/deny': {
    excluded: 'owner_approval_decision',
    note: 'The owner denies in Seald; the agent only polls approvals_get for the outcome.',
  },
  'POST /approvals/:id/refresh': {
    excluded: 'owner_approval_decision',
    note: 'Re-mints after the owner edits fields from Review; an agent re-previews through its own tool instead.',
  },

  // Automations. The owner routes (WP-31) call the same AutomationsService as
  // the A3 tools. `automations_test_webhook` ships with A2b's MCP half over
  // the same `AutomationTestService.sendTest`. WP-45: deleting a recipe is a
  // plain write; rotating its webhook secret waits on the owner, and the new
  // secret is shown once on the approval page, never to the agent.
  'GET /automations': { tool: 'automations_list' },
  'POST /automations': { tool: 'automations_upsert_recipe' },
  'GET /automations/:id': { tool: 'automations_list' },
  'PATCH /automations/:id': { tool: 'automations_upsert_recipe' },
  'DELETE /automations/:id': { tool: 'automations_delete' },
  'POST /automations/:id/rotate-secret': { tool: 'automations_rotate_secret' },
  'GET /automations/:id/runs': { tool: 'automations_list_runs' },
  'GET /automations/runs/:runId': { tool: 'automations_get_run' },
  'POST /automations/:id/runs/:runId/retry': { tool: 'automations_retry_run' },
  'POST /automations/:id/test': { planned: 'step-a2b' },

  // Contacts (step 12). contacts_search and contacts_import have no route of
  // their own: search filters the list, import saves rows through create and update.
  'GET /contacts': { tool: 'contacts_list' },
  'POST /contacts': { tool: 'contacts_create' },
  'GET /contacts/:id': { tool: 'contacts_get' },
  'PATCH /contacts/:id': { tool: 'contacts_update' },
  'DELETE /contacts/:id': { tool: 'contacts_delete' },
  // Contacts redesign: paste-a-list add, bulk delete, and the Undo for a delete.
  'POST /contacts/bulk': { tool: 'contacts_import' },
  'DELETE /contacts': { tool: 'contacts_delete' },
  'POST /contacts/restore': { planned: 'step-16' },

  // Templates (steps 13 and 15): the listing, the schema read, the draft built
  // from a template and template authoring are tools. The example PDF and the
  // WP-37 direct link are the owner's, in the app.
  'GET /templates': { tool: 'templates_list' },
  'POST /templates': { tool: 'templates_create' },
  'GET /templates/:id': { tool: 'templates_get_schema' },
  'PATCH /templates/:id': { tool: 'templates_update' },
  'DELETE /templates/:id': { tool: 'templates_delete' },
  // Templates redesign: duplicate a template, and the Undo for a delete. No tool yet.
  'POST /templates/:id/duplicate': { planned: 'step-16' },
  'POST /templates/:id/restore': { planned: 'step-16' },
  // envelopes_create_from_template bumps the use count itself, after success.
  'POST /templates/:id/use': { tool: 'envelopes_create_from_template' },
  'POST /templates/:id/apply': { tool: 'envelopes_create_from_template' },
  'POST /templates/:id/example': {
    excluded: 'owner_in_app_only',
    note: 'A PDF body. The owner uploads the example in the app; templates_create saves the layout only.',
  },
  'GET /templates/:id/example': {
    excluded: 'owner_in_app_only',
    note: 'Streams the example PDF bytes for the app editor; an agent reads a template with templates_get_schema.',
  },
  // WP-36 bulk send from a template (WP-26, step 15): one approval confirms the batch.
  'GET /templates/:id/bulk-schema': { tool: 'templates_get_schema' },
  'POST /templates/:id/bulk-batches': { tool: 'envelopes_bulk_send_from_template' },
  'GET /bulk-batches/:id': { tool: 'batches_get' },
  // The owner's Approve of the bulk approval confirms the batch.
  'POST /bulk-batches/:id/confirm': { tool: 'envelopes_bulk_send_from_template' },
  'POST /bulk-batches/:id/cancel': {
    excluded: 'owner_in_app_only',
    note: 'Stops a batch the owner already approved. The owner stops it in the app; the agent polls batches_get.',
  },
  'POST /uploads/convert': {
    excluded: 'owner_in_app_only',
    note: 'Turns the file the owner picked on the upload screen into PDF bytes; an agent stages files with documents_upload.',
  },
  // WP-37: the template's direct link (the public `/direct-links/*` routes are
  // @Public). Creating, rotating or revoking a public link is the owner's call in the app.
  'GET /templates/:id/direct-link': {
    excluded: 'owner_in_app_only',
    note: 'The link and its claim counts belong to the owner; the design doc names no direct-link tool.',
  },
  'POST /templates/:id/direct-link': {
    excluded: 'owner_in_app_only',
    note: 'Publishes a link anyone can use to start an envelope from the template; owner only, in the app.',
  },
  'PATCH /templates/:id/direct-link': {
    excluded: 'owner_in_app_only',
    note: 'Changes who can use a published link; owner only, in the app.',
  },
  'POST /templates/:id/direct-link/rotate': {
    excluded: 'owner_in_app_only',
    note: 'Replaces the public link; owner only, in the app.',
  },
  'DELETE /templates/:id/direct-link': {
    excluded: 'owner_in_app_only',
    note: 'Turns the public link off; owner only, in the app.',
  },

  // Agent activity (WP-26): the owner's list of what each key did.
  'GET /agent-activity': {
    excluded: 'owner_in_app_only',
    note: 'The owner oversight list of agent actions on the Developers page; agents read their own results through approvals_list and envelopes_list_events.',
  },

  // Google Drive
  // A Seald settings link, not a consent URL minted for the key (see the tool).
  'GET /integrations/gdrive/oauth/url': { tool: 'gdrive_connect_url' },
  'GET /integrations/gdrive/oauth/start': {
    excluded: 'oauth_browser_redirect',
    note: 'Full-page 302 to Google for mobile browsers; an agent gets the same consent link from oauth/url.',
  },
  'GET /integrations/gdrive/accounts': { tool: 'gdrive_list_accounts' },
  'DELETE /integrations/gdrive/accounts/:id': { tool: 'gdrive_disconnect' },
  'GET /integrations/gdrive/files': { tool: 'gdrive_list_files' },
  // An agent cannot open Google's picker: gdrive_import answers a file the
  // app cannot read with gdrive_file_not_picked and a Seald picker link.
  'GET /integrations/gdrive/picker-credentials': { tool: 'gdrive_import' },
  'POST /integrations/gdrive/conversion': { tool: 'gdrive_import' },
  'GET /integrations/gdrive/conversion/:jobId': { tool: 'gdrive_conversion_status' },
  'DELETE /integrations/gdrive/conversion/:jobId': { tool: 'gdrive_conversion_cancel' },
};
