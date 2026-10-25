/**
 * Feature flags shared across api + web. A new flag defaults to `false` so
 * it is dark until explicitly turned on. Reads happen at request
 * time (api) or render time (web) — flipping the const here + redeploying
 * is the activation path. There is no runtime override store today.
 */
export const FEATURE_FLAGS: Record<string, boolean> = {
  /**
   * Google Drive integration (Phase 5 of the gdrive feature). Activated
   * 2026-05-03 after WT-A..WT-E shipped + Phase 6.A iter-2 a11y fixes
   * merged (PR #127). Pre-activation the flag was `false`, which caused
   * `GDriveController.requireFlag()` to 404 every `/integrations/gdrive/*`
   * route on prod — the surface was reachable in the SPA but the API
   * returned `404 not_found` for OAuth URL, accounts list, file picker.
   * When false:
   *   - api: every `/integrations/gdrive/*` route 404s.
   *   - web: source-selection cards + settings page hide the Drive surface.
   * When true (current):
   *   - api: routes serve. If `GDRIVE_OAUTH_CLIENT_ID` / `_CLIENT_SECRET`
   *     are unset on the host the OAuth-URL endpoint returns 503
   *     `gdrive_oauth_not_configured`; the SPA surfaces a dismissible
   *     inline alert (PR #125 + #127 iter-2 Bug D path).
   *   - web: source-selection cards + Settings → Integrations show the
   *     Drive surface.
   */
  gdriveIntegration: true,

  /**
   * Multi-account UI gate for the gdrive Settings page. Data model is
   * already multi-account; this flag only controls the UI affordance.
   */
  gdriveMultiAccount: false,

  /**
   * Multi-document envelopes (WP-03). Gates upload/reorder/delete of extra
   * documents on an envelope. On since the parity flag flip.
   */
  multiDocumentEnvelopes: true,

  /**
   * Sequential signing order (WP-28). Gates signer ordering and the
   * "waiting for previous signer" flow. On since the parity flag flip.
   */
  signingOrder: true,

  /**
   * Field metadata v2 (WP-14). Gates the extended field attributes and
   * their editor UI. On since the parity flag flip.
   */
  fieldMetaV2: true,

  /**
   * Custom reminder schedules (WP-09). Gates per-envelope reminder cadence
   * settings. On since the parity flag flip.
   */
  customReminders: true,

  /**
   * Signer access authentication (WP-16). Gates the emailed one-time code
   * required before a signer opens the document. On since the parity flag flip.
   */
  signerAccessAuth: true,

  /**
   * Appended certificate page (WP-01 item 3). Gates the pre-seal
   * certificate pages rendered into the sealed PDF. On since the parity flag flip.
   */
  appendCertificate: true,

  /**
   * MCP server endpoint (WP-35 family). Gates the `/mcp` route and API key
   * issuance for MCP clients. On since the parity flag flip.
   */
  mcpServer: true,

  /**
   * MCP OAuth 2.1 (WP-27, decision D3). Gates the authorization server
   * (`/.well-known/oauth-*`, `/oauth/*`), the consent page, OAuth access
   * tokens on `/mcp` and "Connected apps". Needs `mcpServer` too, so the
   * OAuth surface stays dark until both are flipped. Off: `/mcp` accepts
   * API keys only, exactly as before.
   */
  mcpOauth: true,

  /**
   * Workflow automations and outbound webhooks (WP-29 family). Gates the
   * automation builder and webhook delivery. On since the parity flag flip.
   */
  workflowAutomations: true,

  /**
   * Public REST API v1 (WP-35 family). Gates the `/api/v1` surface for API
   * keys. On since the parity flag flip.
   */
  publicApi: true,

  /**
   * Bulk send from a template or CSV (WP-21 family). Gates the bulk-send
   * entry point and its batch endpoints. On since the parity flag flip.
   */
  bulkSend: true,

  /**
   * Direct signing links (WP-19 family). Gates shareable direct links that
   * let a signer open a document without an invitation email. On since the
   * parity flag flip.
   */
  directLinks: true,

  /**
   * Internationalisation of the SPA and emails (WP-38 family). Gates the
   * locale switcher and translated strings. On since the parity flag flip.
   */
  i18n: true,

  /**
   * Owner list reads straight from Postgres (docs/supabase-native-architecture.md,
   * step 4). On: the SPA reads the dashboard list, contacts and templates
   * with `supabase.rpc('seald_list_*')` (migration 0050) instead of the API,
   * and falls back to the API while the RPC is not deployed yet. Off: every
   * read goes through the API, as before.
   */
  ownerReadRpcs: false,
} as const;

export type FeatureFlag =
  | 'gdriveIntegration'
  | 'gdriveMultiAccount'
  | 'multiDocumentEnvelopes'
  | 'signingOrder'
  | 'fieldMetaV2'
  | 'customReminders'
  | 'signerAccessAuth'
  | 'appendCertificate'
  | 'mcpServer'
  | 'mcpOauth'
  | 'workflowAutomations'
  | 'publicApi'
  | 'bulkSend'
  | 'directLinks'
  | 'i18n'
  | 'ownerReadRpcs';

/**
 * Runtime override hook for tests / local walkthroughs. Production never
 * sets this global, so this branch is dead code in shipped builds. The
 * Playwright BDD harness uses `addInitScript` to inject a flag override
 * before the SPA boots so an e2e scenario tagged "feature flag is on"
 * can render the gated surface without flipping the static constant.
 */
interface FeatureOverrideHost {
  readonly __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>>;
}

function readOverride(flag: FeatureFlag): boolean | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  const overrides = (globalThis as unknown as FeatureOverrideHost).__SEALD_FEATURE_OVERRIDES__;
  return overrides ? overrides[flag] : undefined;
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const override = readOverride(flag);
  if (override !== undefined) return override;
  return FEATURE_FLAGS[flag] === true;
}
