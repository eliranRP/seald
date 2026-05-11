import type { EnvelopeListItem } from 'shared';
import type { StatusOption } from './types';

/**
 * Status-bucket helpers for the dashboard.
 *
 * The actual list filtering is performed server-side (`GET /envelopes`
 * with `?q=&bucket=&date=&signer=&tags=`). These helpers are still
 * used client-side for:
 *   - the toolbar's per-bucket counts, computed over the unfiltered
 *     envelope list (`bucketEnvelope`); and
 *   - the dashboard row's "Awaiting you" badge (`isAwaitingYou`).
 */

/**
 * Returns true when the viewer is a signer on the envelope and hasn't
 * yet completed/declined. The dashboard view treats `awaiting_others`
 * AND `sealing` as candidates — `sealing` only fires at the tail end
 * of the lifecycle, but if the viewer's signer entry is still open
 * (co-sign races) they should still see it bucketed under awaiting-you.
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
 * one bucket. Mirrors the server's bucket resolution so the toolbar's
 * counts match what a `?bucket=` filter would return.
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
