import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Envelope, EnvelopeSigner } from '@/features/envelopes';
import { useEnvelopeProgress } from './useEnvelopeProgress';

function signer(overrides: Partial<EnvelopeSigner> = {}): EnvelopeSigner {
  return {
    id: 's',
    email: 'a@b.com',
    name: 'A',
    color: '#000',
    role: 'signatory',
    signing_order: 1,
    status: 'awaiting',
    viewed_at: null,
    tc_accepted_at: null,
    signed_at: null,
    declined_at: null,
    ...overrides,
  };
}

function env(overrides: Partial<Envelope> = {}): Envelope {
  return {
    id: 'env-1',
    owner_id: 'u',
    title: 'NDA',
    short_code: 'NDA-1',
    status: 'awaiting_others',
    original_pages: 1,
    expires_at: '2030-01-01T00:00:00Z',
    tc_version: '1',
    privacy_version: '1',
    sent_at: null,
    completed_at: null,
    signers: [signer()],
    fields: [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

describe('useEnvelopeProgress', () => {
  it('returns the empty-progress shape when the envelope is not yet loaded', () => {
    const { result } = renderHook(() => useEnvelopeProgress(undefined));
    expect(result.current.signed).toBe(0);
    expect(result.current.total).toBe(0);
    expect(result.current.pct).toBe(0);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.isTerminal).toBe(false);
    expect(result.current.hasPending).toBe(false);
  });

  it('counts signed (status=completed), waiting (awaiting/viewing), and percentage', () => {
    const e = env({
      signers: [
        signer({ id: '1', status: 'completed', signed_at: '2026-04-01T00:00:00Z' }),
        signer({ id: '2', status: 'awaiting' }),
        signer({ id: '3', status: 'viewing' }),
        signer({ id: '4', status: 'completed', signed_at: '2026-04-01T00:00:00Z' }),
      ],
    });
    const { result } = renderHook(() => useEnvelopeProgress(e));
    expect(result.current.signed).toBe(2);
    expect(result.current.waiting).toBe(2);
    expect(result.current.total).toBe(4);
    expect(result.current.pct).toBe(50);
    expect(result.current.hasPending).toBe(true);
  });

  it('reports pct=0 for an envelope with no signers (no divide-by-zero)', () => {
    const e = env({ signers: [] });
    const { result } = renderHook(() => useEnvelopeProgress(e));
    expect(result.current.pct).toBe(0);
    expect(result.current.total).toBe(0);
    expect(result.current.hasPending).toBe(false);
  });

  it('isComplete only when status === completed', () => {
    const e = env({
      status: 'completed',
      signers: [signer({ status: 'completed', signed_at: '2026-04-01T00:00:00Z' })],
    });
    const { result } = renderHook(() => useEnvelopeProgress(e));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.isTerminal).toBe(true);
    expect(result.current.pct).toBe(100);
  });

  it('isDeclined for declined OR expired (the page paints both red)', () => {
    const declined = renderHook(() => useEnvelopeProgress(env({ status: 'declined' })));
    expect(declined.result.current.isDeclined).toBe(true);
    const expired = renderHook(() => useEnvelopeProgress(env({ status: 'expired' })));
    expect(expired.result.current.isDeclined).toBe(true);
  });

  it('isTerminal covers canceled (matches TERMINAL_STATUSES contract)', () => {
    const { result } = renderHook(() => useEnvelopeProgress(env({ status: 'canceled' })));
    expect(result.current.isTerminal).toBe(true);
    expect(result.current.isComplete).toBe(false);
  });

  it('hasPending is false once every signer has signed or declined', () => {
    const e = env({
      signers: [
        signer({ id: '1', status: 'completed', signed_at: '2026-04-01T00:00:00Z' }),
        signer({ id: '2', status: 'declined', declined_at: '2026-04-01T00:01:00Z' }),
      ],
    });
    const { result } = renderHook(() => useEnvelopeProgress(e));
    expect(result.current.hasPending).toBe(false);
  });

  it('memoizes the result so referential identity is stable across re-renders', () => {
    const e = env();
    const { result, rerender } = renderHook(
      ({ x }: { readonly x: Envelope }) => useEnvelopeProgress(x),
      {
        initialProps: { x: e },
      },
    );
    const first = result.current;
    rerender({ x: e });
    expect(result.current).toBe(first);
  });
});
