import type { Envelope } from './envelope.entity';
import type { DateWindow, EnvelopeBucket, ListFilters } from './envelopes.repository';

/**
 * In-memory mirror of the dashboard-filter `WHERE` clauses that
 * `EnvelopesPgRepository.listByOwner` runs in SQL. The in-memory
 * test double and the service-spec fakes reuse this so their results
 * match the Pg adapter byte-for-byte under the same filter inputs.
 *
 * Keep this in lock-step with the SQL: substring match on
 * title+short_code, OR-of-buckets, `[from,to)` window on updated_at,
 * any-of-signers, any-of-tags.
 */

function viewerIsPendingSigner(e: Envelope, viewerEmail: string): boolean {
  const v = viewerEmail.toLowerCase();
  return e.signers.some(
    (s) => s.email.toLowerCase() === v && s.signed_at === null && s.declined_at === null,
  );
}

function matchesBucket(e: Envelope, bucket: EnvelopeBucket, viewerEmail: string): boolean {
  switch (bucket) {
    case 'draft':
      return e.status === 'draft';
    case 'sealed':
      return e.status === 'completed';
    case 'declined':
      return e.status === 'declined';
    case 'awaiting_you':
      return (
        (e.status === 'awaiting_others' || e.status === 'sealing') &&
        viewerIsPendingSigner(e, viewerEmail)
      );
    case 'awaiting_others':
      return (
        (e.status === 'awaiting_others' || e.status === 'sealing') &&
        !viewerIsPendingSigner(e, viewerEmail)
      );
  }
}

function inWindow(iso: string, w: DateWindow): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(w.from).getTime() && t < new Date(w.to).getTime();
}

export function applyListFilters(
  envelopes: ReadonlyArray<Envelope>,
  filters: ListFilters & { readonly viewerEmail?: string | null },
): Envelope[] {
  const q = filters.q && filters.q.trim() !== '' ? filters.q.trim().toLowerCase() : null;
  const viewer = (filters.viewerEmail ?? '').toLowerCase();
  const signerSet =
    filters.signerEmails && filters.signerEmails.length > 0
      ? new Set(filters.signerEmails.map((x) => x.toLowerCase()))
      : null;
  const tagSet =
    filters.tags && filters.tags.length > 0
      ? new Set(filters.tags.map((t) => t.toLowerCase()))
      : null;
  const buckets = filters.buckets && filters.buckets.length > 0 ? filters.buckets : null;

  return envelopes.filter((e) => {
    if (q !== null) {
      if (!e.title.toLowerCase().includes(q) && !e.short_code.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filters.date && !inWindow(e.updated_at, filters.date)) return false;
    if (signerSet !== null && !e.signers.some((s) => signerSet.has(s.email.toLowerCase()))) {
      return false;
    }
    if (tagSet !== null && !(e.tags ?? []).some((t) => tagSet.has(t.toLowerCase()))) return false;
    if (buckets !== null && !buckets.some((b) => matchesBucket(e, b, viewer))) return false;
    return true;
  });
}
