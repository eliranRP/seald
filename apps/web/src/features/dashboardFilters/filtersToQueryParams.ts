import type { EnvelopeFilters, StatusOption } from './types';

/**
 * Shape of the dashboard filter params on `GET /envelopes`. The
 * server reads these and pushes the filtering into SQL.
 */
export interface FilterQueryParams {
  /** Substring on title + short_code. */
  readonly q?: string;
  /** Status buckets — comma-joined on the wire by the API client. */
  readonly bucket?: ReadonlyArray<StatusOption>;
  /** Date filter: a preset keyword, or `custom:YYYY-MM-DD:YYYY-MM-DD`. */
  readonly date?: string;
  /** Selected signer emails. */
  readonly signer?: ReadonlyArray<string>;
  /** Selected tag names. */
  readonly tags?: ReadonlyArray<string>;
}

/**
 * Map the URL-parsed `EnvelopeFilters` into the `GET /envelopes`
 * query-param shape. Omits anything in its no-op state so the request
 * URL stays minimal. The `DateFilter` is re-serialized to the
 * preset / `custom:from:to` string the API expects (the server owns
 * "now" and resolves the actual `[from,to)` window).
 *
 * Note: `EnvelopeFilters.status` already uses the API's `bucket`
 * vocabulary (`draft | awaiting_you | awaiting_others | sealed |
 * declined`), so it's a passthrough.
 */
export function filtersToQueryParams(filters: EnvelopeFilters): FilterQueryParams {
  const out: {
    q?: string;
    bucket?: ReadonlyArray<StatusOption>;
    date?: string;
    signer?: ReadonlyArray<string>;
    tags?: ReadonlyArray<string>;
  } = {};
  if (filters.q !== '') out.q = filters.q;
  if (filters.status.length > 0) out.bucket = filters.status;
  if (filters.date.kind === 'preset') {
    if (filters.date.preset !== 'all') out.date = filters.date.preset;
  } else {
    out.date = `custom:${filters.date.range.from}:${filters.date.range.to}`;
  }
  if (filters.signer.length > 0) out.signer = filters.signer;
  if (filters.tags.length > 0) out.tags = filters.tags;
  return out;
}
