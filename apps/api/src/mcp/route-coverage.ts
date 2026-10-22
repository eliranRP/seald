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
 *   signer-link, verify, cron or OAuth browser redirect route).
 *
 * `@Public()` routes (signing, verify, cron, health, the OAuth callback
 * and `/mcp` itself) are skipped by decorator in
 * `route-coverage.contract.spec.ts`, not listed here by hand.
 *
 * Every tool pull request moves its routes from `planned` to `tool` and
 * adds its step to `SHIPPED_STEPS`.
 */

/** Steps whose tools have shipped. A `planned` entry may not name one. */
export const SHIPPED_STEPS = ['step-4', 'step-5', 'step-6'] as const;

export const EXCLUSION_REASONS = [
  'signer_link',
  'verify',
  'cron',
  'oauth_browser_redirect',
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
  'POST /envelopes': { planned: 'step-8c' },
  'GET /envelopes/:id': { tool: 'envelopes_get' },
  'PATCH /envelopes/:id': { planned: 'step-8c' },
  'PUT /envelopes/:id/signing-order': { planned: 'step-8c' },
  'DELETE /envelopes/:id': { planned: 'step-8c' },
  'POST /envelopes/:id/upload': { planned: 'step-8b' },
  'POST /envelopes/:id/send': { planned: 'step-10' },
  'POST /envelopes/:id/cancel': { planned: 'step-11' },
  'POST /envelopes/:id/signers/:signer_id/remind': { planned: 'step-11' },
  'POST /envelopes/:id/signers': { planned: 'step-8c' },
  'DELETE /envelopes/:id/signers/:signer_id': { planned: 'step-8c' },
  'PUT /envelopes/:id/fields': { planned: 'step-9' },
  'GET /envelopes/:id/events': { tool: 'envelopes_list_events' },
  'GET /envelopes/:id/download': { tool: 'envelopes_download_url' },
  'POST /envelopes/:id/gdrive/save': { planned: 'step-14' },

  // Documents of an envelope (WP-03)
  'GET /envelopes/:id/documents': { tool: 'envelopes_get' },
  'POST /envelopes/:id/documents': { planned: 'step-8b' },
  'PUT /envelopes/:id/documents/order': { planned: 'step-8c' },
  'DELETE /envelopes/:id/documents/:document_id': { planned: 'step-8c' },

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

  // Google Drive
  'GET /integrations/gdrive/oauth/url': { planned: 'step-8d' },
  'GET /integrations/gdrive/oauth/start': {
    excluded: 'oauth_browser_redirect',
    note: 'Full-page 302 to Google for mobile browsers; an agent gets the same consent link from oauth/url.',
  },
  'GET /integrations/gdrive/accounts': { planned: 'step-8d' },
  'DELETE /integrations/gdrive/accounts/:id': { planned: 'step-14' },
  'GET /integrations/gdrive/files': { planned: 'step-8d' },
  'GET /integrations/gdrive/picker-credentials': { planned: 'step-8d' },
  'POST /integrations/gdrive/conversion': { planned: 'step-8d' },
  'GET /integrations/gdrive/conversion/:jobId': { planned: 'step-8d' },
  'DELETE /integrations/gdrive/conversion/:jobId': { planned: 'step-8d' },
};
