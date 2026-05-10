import {
  ACTIONABLE_INBOX,
  DATE_PRESETS,
  STATUS_OPTIONS,
  type DateFilter,
  type DatePreset,
  type EnvelopeFilters,
  type StatusOption,
} from './types';

const STATUS_SET = new Set<string>(STATUS_OPTIONS);
const PRESET_SET = new Set<string>(DATE_PRESETS);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Decode the dashboard filter URL contract into a structured object.
 *
 * Default-on-first-visit (no params at all) returns the actionable
 * inbox: `Awaiting you + Awaiting others`. Once any other param is
 * present (search / date / signer), the default is suppressed —
 * the user has begun narrowing and the actionable filter would
 * otherwise hide envelopes they likely want to see.
 *
 * Malformed values (unknown preset, broken custom range, unknown
 * status token) are silently ignored — the filter behaves as if
 * absent. Per spec: never error on an unparseable URL.
 */
export function parseFilters(params: URLSearchParams): EnvelopeFilters {
  const hasAnyParam =
    params.has('q') ||
    params.has('status') ||
    params.has('date') ||
    params.has('signer') ||
    params.has('tags');

  return {
    q: (params.get('q') ?? '').toLowerCase(),
    status: parseStatus(params.get('status'), hasAnyParam),
    date: parseDate(params.get('date')),
    signer: parseList(params.get('signer')),
    tags: parseList(params.get('tags')),
  };
}

function parseList(raw: string | null): ReadonlyArray<string> {
  if (raw === null || raw === '') return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

function parseStatus(raw: string | null, hasAnyParam: boolean): ReadonlyArray<StatusOption> {
  if (raw === null) {
    // No `status` param at all: apply the actionable-inbox default
    // ONLY if no other filter is active. Otherwise treat as "no
    // status filter" so the user's search/date/signer scope spans
    // every envelope.
    return hasAnyParam ? [] : ACTIONABLE_INBOX;
  }
  if (raw === 'all') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is StatusOption => STATUS_SET.has(s));
}

function parseDate(raw: string | null): DateFilter {
  if (raw === null) return { kind: 'preset', preset: 'all' };
  if (raw.startsWith('custom:')) {
    const [, from, to] = raw.split(':');
    if (from && to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
      return { kind: 'custom', range: { from, to } };
    }
    return { kind: 'preset', preset: 'all' };
  }
  if (PRESET_SET.has(raw)) return { kind: 'preset', preset: raw as DatePreset };
  return { kind: 'preset', preset: 'all' };
}

export interface SerializeInput extends Omit<EnvelopeFilters, 'status'> {
  readonly status: ReadonlyArray<StatusOption>;
  /**
   * When `true`, an empty `status` list serializes to `?status=all`.
   * Distinguishes "user cleared the chip" (explicit) from "first
   * visit" (defaults will re-apply on reload). Defaults to `false`,
   * which omits the param entirely.
   */
  readonly explicitAllStatus?: boolean;
}

/**
 * Inverse of `parseFilters` — emits a URL search-params string. Omits
 * params that match the no-op state so the URL stays clean. Used by
 * the toolbar chips to write filter changes back to the URL.
 */
export function serializeFilters(filters: SerializeInput): string {
  const out = new URLSearchParams();
  if (filters.q !== '') out.set('q', filters.q);
  if (filters.status.length > 0) out.set('status', filters.status.join(','));
  else if (filters.explicitAllStatus === true) out.set('status', 'all');
  if (filters.date.kind === 'preset' && filters.date.preset !== 'all') {
    out.set('date', filters.date.preset);
  } else if (filters.date.kind === 'custom') {
    out.set('date', `custom:${filters.date.range.from}:${filters.date.range.to}`);
  }
  if (filters.signer.length > 0) out.set('signer', filters.signer.join(','));
  if (filters.tags.length > 0) out.set('tags', filters.tags.join(','));
  return out.toString();
}
