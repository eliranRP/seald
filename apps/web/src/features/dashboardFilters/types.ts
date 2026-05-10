/**
 * Filter shape parsed from the dashboard URL search params. Lives in
 * its own module so the pure helpers (`parseFilters`, `filterEnvelopes`)
 * stay decoupled from React.
 */

export const STATUS_OPTIONS = [
  'draft',
  'awaiting_you',
  'awaiting_others',
  'sealed',
  'declined',
] as const;
export type StatusOption = (typeof STATUS_OPTIONS)[number];

export const DATE_PRESETS = ['today', '7d', '30d', 'thisMonth', 'all'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export interface CustomDateRange {
  /** ISO yyyy-mm-dd, inclusive lower bound. */
  readonly from: string;
  /** ISO yyyy-mm-dd, inclusive upper bound. */
  readonly to: string;
}

export type DateFilter =
  | { readonly kind: 'preset'; readonly preset: DatePreset }
  | {
      readonly kind: 'custom';
      readonly range: CustomDateRange;
    };

export interface EnvelopeFilters {
  /** Lower-cased substring; matches doc title + envelope short code. */
  readonly q: string;
  /**
   * Selected status options. Empty array = no status filter (treat as
   * "show all"). Default-on-first-visit (no `status` param) is set at
   * the call site, not here.
   */
  readonly status: ReadonlyArray<StatusOption>;
  readonly date: DateFilter;
  /**
   * Lower-cased emails of selected signers. Empty array = no signer
   * filter. Matched as exact emails because the UI lets the user
   * pick from a known roster (no free-text fallback).
   */
  readonly signer: ReadonlyArray<string>;
}

/**
 * Default applied when the URL has no params at all (first visit /
 * page reset). Per spec: actionable inbox.
 */
export const ACTIONABLE_INBOX: ReadonlyArray<StatusOption> = ['awaiting_you', 'awaiting_others'];
