import type { EnvelopeListItem } from 'shared';
import type { EnvelopeFilters, StatusOption } from './types';

/**
 * Returns true when the viewer is a signer on the envelope and hasn't
 * yet completed/declined. Centralizes the predicate so both the
 * status-bucketing logic and any UI badge that wants to surface
 * "your turn" agree on what that means.
 *
 * Note: the dashboard view treats `awaiting_others` AND `sealing` as
 * candidates — `sealing` only fires at the tail end of the envelope
 * lifecycle, but if the viewer's signer entry is still open (e.g.
 * co-sign races), they should still see it bucketed under awaiting-you.
 */
export function isAwaitingYou(envelope: EnvelopeListItem, viewerEmail: string | null): boolean {
  if (viewerEmail === null) return false;
  if (envelope.status !== 'awaiting_others' && envelope.status !== 'sealing') return false;
  const v = viewerEmail.toLowerCase();
  return envelope.signers.some(
    (s) => s.email.toLowerCase() === v && s.status !== 'completed' && s.status !== 'declined',
  );
}

/**
 * Bucket an envelope into one of the status options surfaced in the
 * filter chip. Mutually exclusive: every envelope belongs to exactly
 * one bucket, so a status-filter intersection is well-defined.
 */
export function bucketEnvelope(
  envelope: EnvelopeListItem,
  viewerEmail: string | null,
): StatusOption | null {
  if (envelope.status === 'draft') return 'draft';
  if (envelope.status === 'completed') return 'sealed';
  if (envelope.status === 'declined') return 'declined';
  if (isAwaitingYou(envelope, viewerEmail)) return 'awaiting_you';
  if (envelope.status === 'awaiting_others' || envelope.status === 'sealing') {
    return 'awaiting_others';
  }
  return null;
}

/**
 * Anchor every preset window to UTC midnight so the dashboard renders
 * the same buckets regardless of the user's local timezone (and so
 * the tests aren't flaky on CI runners). Server-side timestamps on
 * envelopes are stored in UTC; treating the windows the same way
 * keeps the comparison apples-to-apples.
 */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dateRangeFromFilter(filter: EnvelopeFilters['date']): { from: Date; to: Date } | null {
  if (filter.kind === 'preset') {
    if (filter.preset === 'all') return null;
    const now = new Date();
    const today = startOfUtcDay(now);
    if (filter.preset === 'today') {
      const end = new Date(today);
      end.setUTCDate(end.getUTCDate() + 1);
      return { from: today, to: end };
    }
    if (filter.preset === '7d') {
      const from = new Date(today);
      from.setUTCDate(from.getUTCDate() - 6);
      const to = new Date(today);
      to.setUTCDate(to.getUTCDate() + 1);
      return { from, to };
    }
    if (filter.preset === '30d') {
      const from = new Date(today);
      from.setUTCDate(from.getUTCDate() - 29);
      const to = new Date(today);
      to.setUTCDate(to.getUTCDate() + 1);
      return { from, to };
    }
    if (filter.preset === 'thisMonth') {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
      return { from, to };
    }
    return null;
  }
  // Custom range: inclusive on both ends. We treat the bounds as UTC
  // calendar days and add 1 day to `to` so the half-open interval
  // `[from, to)` still includes the upper-bound day.
  const from = new Date(`${filter.range.from}T00:00:00Z`);
  const toExclusive = new Date(`${filter.range.to}T00:00:00Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from, to: toExclusive };
}

/**
 * Apply the four dashboard filters in AND.
 *
 *   - q (search): substring match on `title` + `short_code`
 *   - status: each envelope is bucketed into exactly one option;
 *     keep when the bucket is in the selected list
 *   - date: half-open `[from, to)` window over `updated_at`
 *   - signer: substring match across each signer's name + email
 *
 * `viewerEmail` is needed to resolve the awaiting-you bucket. Pure;
 * does not mutate the input.
 */
export function filterEnvelopes(
  envelopes: ReadonlyArray<EnvelopeListItem>,
  filters: EnvelopeFilters,
  viewerEmail: string | null,
): ReadonlyArray<EnvelopeListItem> {
  const range = dateRangeFromFilter(filters.date);
  const q = filters.q;
  const signerSet = filters.signer.length > 0 ? new Set(filters.signer) : null;
  const statusSet = filters.status.length > 0 ? new Set(filters.status) : null;

  return envelopes.filter((env) => {
    if (q !== '') {
      const title = env.title.toLowerCase();
      const code = env.short_code.toLowerCase();
      if (!title.includes(q) && !code.includes(q)) return false;
    }
    if (statusSet !== null) {
      const bucket = bucketEnvelope(env, viewerEmail);
      if (bucket === null || !statusSet.has(bucket)) return false;
    }
    if (range !== null) {
      const updated = new Date(env.updated_at);
      if (updated < range.from || updated >= range.to) return false;
    }
    if (signerSet !== null) {
      const matched = env.signers.some((s) => signerSet.has(s.email.toLowerCase()));
      if (!matched) return false;
    }
    return true;
  });
}
