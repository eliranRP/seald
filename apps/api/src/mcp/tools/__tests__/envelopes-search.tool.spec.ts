import { EnvelopesSearchOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../leak-scan';
import {
  DOC_1,
  ENVELOPE_ID,
  OTHER_ENVELOPE_ID,
  OTHER_OWNER,
  READ_METHODS,
  call,
  envelopeFixture,
  errorOf,
  okOf,
  world,
} from './harness';

describe('envelopes_search', () => {
  it("returns the owner's matches with signer states and documents", async () => {
    const w = world();
    w.envelopes.push(envelopeFixture({ id: OTHER_ENVELOPE_ID, owner_id: OTHER_OWNER }));
    const out = okOf(
      await call(w, 'envelopes_search', {
        title: 'contract',
        signer: 'bob',
        status: ['awaiting_others'],
        tags: 'nda',
        date_from: '2026-09-01T00:00:00Z',
        date_to: '2026-11-01T00:00:00Z',
        limit: 10,
      }),
    );
    expect(EnvelopesSearchOutputSchema.safeParse(out).success).toBe(true);
    const items = out['items'] as Array<{ id: string; signers: Array<{ status: string }> }>;
    // Another owner's envelope never appears.
    expect(items.map((i) => i.id)).toEqual([ENVELOPE_ID]);
    expect(items[0]?.signers.map((s) => s.status)).toEqual(['signed', 'sent']);
    expect(out).toMatchObject({
      items: [{ documents: [{ id: DOC_1, ord: 1 }] }],
      next_cursor: null,
    });
    expect(findTokenShapedStrings(out)).toEqual([]);
  });

  it('accepts no filters at all (there is no required field)', async () => {
    const w = world();
    okOf(await call(w, 'envelopes_search', {}));
  });

  it('rejects an unknown field, a bad status and a limit over 50', async () => {
    const w = world();
    for (const args of [{ q: 'x' }, { status: ['sent'] }, { limit: 51 }, { title: '' }]) {
      expect(errorOf(await call(w, 'envelopes_search', args)).slug).toBe('validation_error');
    }
    expect(w.calls).toEqual([]);
  });

  it('is insufficient_scope without envelopes:read', async () => {
    const w = world();
    const err = errorOf(await call(w, 'envelopes_search', {}, ['contacts:read']));
    expect(err.slug).toBe('insufficient_scope');
    expect(w.calls).toEqual([]);
  });

  it('only calls read methods', async () => {
    const w = world();
    await call(w, 'envelopes_search', { title: 'x' });
    expect(w.calls).toEqual(['queries.search']);
    for (const c of w.calls) expect(READ_METHODS).toContain(c);
  });
});
