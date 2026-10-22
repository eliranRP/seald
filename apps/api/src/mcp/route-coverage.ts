/**
 * MCP parity registry (docs/design/mcp-server.md, MCP-first rule 3, and
 * parity plan decision D5). Every sender route, meaning every route the
 * global Supabase AuthGuard protects, maps to one of:
 *
 * - `{ tool }`: the shipped tool that covers it;
 * - `{ planned }`: the pull-request step (`step-N`) or work package
 *   (`WP-45`, the approval-gated account and key actions) that will ship
 *   its tool;
 * - `{ excluded }`: only for a route with no agent-facing action (a
 *   signer-link, verify, cron or OAuth browser redirect route), or the
 *   owner's own Approve / Deny / review re-mint (the human side of an
 *   approval, browser-only per D5).
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
  'GET /me/export': { planned: 'WP-45' },
  'DELETE /me': { planned: 'WP-45' },
  'GET /me/api-keys': { planned: 'WP-45' },
  'POST /me/api-keys': { planned: 'WP-45' },
  'POST /me/api-keys/:id/revoke': { planned: 'WP-45' },

  // Envelopes
  'GET /envelopes': { tool: 'envelopes_search' },
  'POST /envelopes': { tool: 'envelopes_create' },
  'GET /envelopes/:id': { tool: 'envelopes_get' },
  'PATCH /envelopes/:id': { tool: 'envelopes_update' },
  'PUT /envelopes/:id/signing-order': { tool: 'envelopes_set_recipient_order' },
  // WP-10 signer access-code settings: step 15 (WP-26, MCP "Later" list).
  'GET /envelopes/:id/access-auth': { planned: 'step-15' },
  'PATCH /envelopes/:id/access-auth': { planned: 'step-15' },
  'DELETE /envelopes/:id': { tool: 'envelopes_delete_draft' },
  'POST /envelopes/:id/upload': { tool: 'envelopes_upload_pdf' },
  'POST /envelopes/:id/send': { planned: 'step-10' },
  'POST /envelopes/:id/cancel': { planned: 'step-11' },
  'POST /envelopes/:id/signers/:signer_id/remind': { planned: 'step-11' },
  'POST /envelopes/:id/signers': { tool: 'envelopes_add_signer' },
  'DELETE /envelopes/:id/signers/:signer_id': { tool: 'envelopes_remove_signer' },
  // WP-19 ships placement; suggestions (envelopes_suggest_fields, step 9) have no route.
  'PUT /envelopes/:id/fields': { tool: 'envelopes_place_fields' },
  'GET /envelopes/:id/events': { tool: 'envelopes_list_events' },
  'GET /envelopes/:id/download': { tool: 'envelopes_download_url' },
  'POST /envelopes/:id/gdrive/save': { planned: 'step-14' },

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

  // Contacts
  'GET /contacts': { planned: 'step-12' },
  'POST /contacts': { planned: 'step-12' },
  'GET /contacts/:id': { planned: 'step-12' },
  'PATCH /contacts/:id': { planned: 'step-12' },
  'DELETE /contacts/:id': { planned: 'step-12' },

  // Templates
  'GET /templates': { planned: 'step-13' },
  'POST /templates': { planned: 'step-13' },
  'GET /templates/:id': { planned: 'step-13' },
  'PATCH /templates/:id': { planned: 'step-13' },
  'DELETE /templates/:id': { planned: 'step-13' },
  'POST /templates/:id/use': { planned: 'step-13' },
  'POST /templates/:id/apply': { planned: 'step-13' },
  'POST /templates/:id/example': { planned: 'step-13' },
  'GET /templates/:id/example': { planned: 'step-13' },
  // WP-36 bulk send from a template: MCP "Later" list (WP-26),
  // `envelopes_bulk_send_from_template` + `batches_get` over the same service.
  'GET /templates/:id/bulk-schema': { planned: 'step-15' },
  'POST /templates/:id/bulk-batches': { planned: 'step-15' },
  'GET /bulk-batches/:id': { planned: 'step-15' },
  'POST /bulk-batches/:id/confirm': { planned: 'step-15' },
  'POST /bulk-batches/:id/cancel': { planned: 'step-15' },
  // WP-37: the template's direct link (the public `/direct-links/*` routes are @Public).
  'GET /templates/:id/direct-link': { planned: 'step-13' },
  'POST /templates/:id/direct-link': { planned: 'step-13' },
  'PATCH /templates/:id/direct-link': { planned: 'step-13' },
  'POST /templates/:id/direct-link/rotate': { planned: 'step-13' },
  'DELETE /templates/:id/direct-link': { planned: 'step-13' },

  // Google Drive
  // A Seald settings link, not a consent URL minted for the key (see the tool).
  'GET /integrations/gdrive/oauth/url': { tool: 'gdrive_connect_url' },
  'GET /integrations/gdrive/oauth/start': {
    excluded: 'oauth_browser_redirect',
    note: 'Full-page 302 to Google for mobile browsers; an agent gets the same consent link from oauth/url.',
  },
  'GET /integrations/gdrive/accounts': { tool: 'gdrive_list_accounts' },
  'DELETE /integrations/gdrive/accounts/:id': { planned: 'step-14' },
  'GET /integrations/gdrive/files': { tool: 'gdrive_list_files' },
  // An agent cannot open Google's picker: gdrive_import answers a file the
  // app cannot read with gdrive_file_not_picked and a Seald picker link.
  'GET /integrations/gdrive/picker-credentials': { tool: 'gdrive_import' },
  'POST /integrations/gdrive/conversion': { tool: 'gdrive_import' },
  'GET /integrations/gdrive/conversion/:jobId': { tool: 'gdrive_conversion_status' },
  'DELETE /integrations/gdrive/conversion/:jobId': { tool: 'gdrive_conversion_cancel' },
};
