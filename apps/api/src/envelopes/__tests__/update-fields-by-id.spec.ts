import { InMemoryEnvelopesRepository } from '../../../test/in-memory-envelopes-repository';
import { EnvelopeFieldNotFoundError } from '../envelopes.repository';

describe('InMemoryEnvelopesRepository.updateFieldsById', () => {
  it('keeps the field id, applies the patch, and rejects an unknown id', async () => {
    const repo = new InMemoryEnvelopesRepository();
    const envelope = await repo.createDraft({
      owner_id: 'owner-1',
      title: 'Draft',
      short_code: 'upd-1',
      tc_version: '1',
      privacy_version: '1',
      expires_at: '2026-12-31T00:00:00.000Z',
    });
    const signer = await repo.addSigner(envelope.id, {
      email: 'ada@example.com',
      name: 'Ada',
      color: '#336699',
    });
    const created = await repo.replaceFields(envelope.id, [
      {
        signer_id: signer.id,
        kind: 'signature',
        page: 1,
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.05,
        required: true,
        link_id: null,
      },
    ]);
    const original = created[0];
    expect(original).toBeDefined();
    if (!original) return;
    const updated = await repo.updateFieldsById(
      envelope.id,
      [
        {
          field_id: original.id,
          signer_id: signer.id,
          kind: 'signature',
          page: 1,
          x: 0.4,
          y: 0.2,
          width: 0.3,
          height: 0.05,
          required: true,
          link_id: null,
        },
      ],
      [],
    );
    expect(updated).toHaveLength(1);
    expect(updated[0]?.id).toBe(original.id);
    expect(updated[0]?.x).toBe(0.4);

    const removed = await repo.updateFieldsById(envelope.id, [], [original.id]);
    expect(removed).toEqual([]);

    await expect(
      repo.updateFieldsById(
        envelope.id,
        [
          {
            field_id: original.id,
            signer_id: signer.id,
            kind: 'text',
            page: 1,
            x: 0.1,
            y: 0.2,
            width: 0.2,
            height: 0.04,
            required: true,
            link_id: null,
          },
        ],
        [],
      ),
    ).rejects.toBeInstanceOf(EnvelopeFieldNotFoundError);
  });
});
