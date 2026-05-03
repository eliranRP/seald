/**
 * Feature flags shared across api + web. Default everything to `false` so
 * a new flag is dark until explicitly turned on. Reads happen at request
 * time (api) or render time (web) — flipping the const here + redeploying
 * is the activation path. There is no runtime override store today.
 */
export const FEATURE_FLAGS: Record<string, boolean> = {
  /**
   * Google Drive integration (Phase 5 of the gdrive feature). Off until
   * WT-A through WT-E all merge and the backend is verified end-to-end.
   * When false:
   *   - api: every `/integrations/gdrive/*` route 404s.
   *   - web: source-selection cards + settings page hide the Drive surface.
   */
  gdriveIntegration: false,

  /**
   * Multi-account UI gate for the gdrive Settings page. Data model is
   * already multi-account; this flag only controls the UI affordance.
   */
  gdriveMultiAccount: false,
} as const;

export type FeatureFlag = 'gdriveIntegration' | 'gdriveMultiAccount';

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
