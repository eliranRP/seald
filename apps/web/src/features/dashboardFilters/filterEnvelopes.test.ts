import { describe, it, expect } from 'vitest';
import type { EnvelopeListItem } from 'shared';
import { bucketEnvelope, isAwaitingYou } from './filterEnvelopes';

function envelope(over: Partial<EnvelopeListItem> = {}): EnvelopeListItem {
  return {
    id: over.id ?? 'env-1',
    title: over.title ?? 'Untitled',
    short_code: over.short_code ?? 'abc12345',
    status: over.status ?? 'draft',
    original_pages: over.original_pages ?? 1,
    sent_at: over.sent_at ?? null,
    completed_at: over.completed_at ?? null,
    expires_at: over.expires_at ?? null,
    tags: over.tags ?? [],
    created_at: over.created_at ?? '2026-05-01T00:00:00Z',
    updated_at: over.updated_at ?? '2026-05-01T00:00:00Z',
    signers: over.signers ?? [],
  } as EnvelopeListItem;
}

function signer(email: string, status: EnvelopeListItem['signers'][number]['status']) {
  return { id: `s-${email}`, name: email, email, status } as EnvelopeListItem['signers'][number];
}

describe('isAwaitingYou', () => {
  it('returns false when no viewer email is supplied', () => {
    expect(
      isAwaitingYou(
        envelope({ status: 'awaiting_others', signers: [signer('you@x', 'awaiting')] }),
        null,
      ),
    ).toBe(false);
  });

  it('returns true when the viewer is a signer that has not yet acted', () => {
    expect(
      isAwaitingYou(
        envelope({ status: 'awaiting_others', signers: [signer('you@example.com', 'awaiting')] }),
        'you@example.com',
      ),
    ).toBe(true);
  });

  it('matches the viewer email case-insensitively', () => {
    expect(
      isAwaitingYou(
        envelope({ status: 'awaiting_others', signers: [signer('you@example.com', 'awaiting')] }),
        'YOU@Example.com',
      ),
    ).toBe(true);
  });

  it('treats `sealing` envelopes as candidates too', () => {
    expect(
      isAwaitingYou(
        envelope({ status: 'sealing', signers: [signer('you@example.com', 'awaiting')] }),
        'you@example.com',
      ),
    ).toBe(true);
  });

  it('returns false once the viewer has signed', () => {
    expect(
      isAwaitingYou(
        envelope({ status: 'awaiting_others', signers: [signer('you@example.com', 'completed')] }),
        'you@example.com',
      ),
    ).toBe(false);
  });

  it('returns false for statuses outside the awaiting window', () => {
    expect(
      isAwaitingYou(
        envelope({ status: 'draft', signers: [signer('you@example.com', 'awaiting')] }),
        'you@example.com',
      ),
    ).toBe(false);
  });
});

describe('bucketEnvelope', () => {
  it('buckets a draft envelope as `draft`', () => {
    expect(bucketEnvelope(envelope({ status: 'draft' }), null)).toBe('draft');
  });

  it('buckets a completed envelope as `sealed`', () => {
    expect(bucketEnvelope(envelope({ status: 'completed' }), null)).toBe('sealed');
  });

  it('buckets a declined envelope as `declined`', () => {
    expect(bucketEnvelope(envelope({ status: 'declined' }), null)).toBe('declined');
  });

  it('buckets as `awaiting_you` when the viewer is still a pending signer', () => {
    expect(
      bucketEnvelope(
        envelope({ status: 'awaiting_others', signers: [signer('you@example.com', 'awaiting')] }),
        'you@example.com',
      ),
    ).toBe('awaiting_you');
  });

  it('buckets as `awaiting_others` when the viewer is not a pending signer', () => {
    expect(
      bucketEnvelope(
        envelope({ status: 'awaiting_others', signers: [signer('other@example.com', 'awaiting')] }),
        'you@example.com',
      ),
    ).toBe('awaiting_others');
  });

  it('buckets `sealing` as `awaiting_others` when the viewer has nothing pending', () => {
    expect(
      bucketEnvelope(
        envelope({ status: 'sealing', signers: [signer('other@example.com', 'completed')] }),
        'you@example.com',
      ),
    ).toBe('awaiting_others');
  });

  it('returns null for terminal-but-unsurfaced statuses (expired / canceled)', () => {
    expect(bucketEnvelope(envelope({ status: 'expired' }), null)).toBeNull();
    expect(bucketEnvelope(envelope({ status: 'canceled' }), null)).toBeNull();
  });
});
