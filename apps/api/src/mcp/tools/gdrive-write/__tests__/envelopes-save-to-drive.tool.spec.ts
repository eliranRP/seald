import { listTools } from '../../../tool-catalog';
import {
  KEY_ID,
  NOW,
  OTHER_OWNER,
  OWNER,
  draft,
  err,
  ok,
  resetFlags,
  setFlags,
  write,
} from '../../__tests__/write-harness';
import {
  APPROVAL_ID,
  callStep,
  stepWorld,
  type StepWorld,
} from '../../contacts/__tests__/step-world';

function complete(w: StepWorld, id: string): void {
  const env = w.envelopesRepo.envelopes.get(id);
  if (!env) throw new Error('no such envelope');
  w.envelopesRepo.envelopes.set(id, {
    ...env,
    status: 'completed',
    completed_at: NOW.toISOString(),
  });
}

const FOLDER = 'folderPickedBySeald_1';

describe('envelopes_save_to_drive', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('never uploads: it asks the owner for this folder and returns approval_pending', async () => {
    const w = stepWorld();
    const id = await draft(w);
    complete(w, id);
    const out = ok(
      await callStep(
        w,
        'envelopes_save_to_drive',
        write({ envelope_id: id, folder_id: FOLDER, folder_name: 'Contracts' }),
      ),
    );
    expect(out).toMatchObject({
      status: 'approval_pending',
      approval_id: APPROVAL_ID,
      approve_requires: 'session',
    });
    expect(out['review_url']).toContain(`/approve/${APPROVAL_ID}/review`);
    expect(w.approvalCalls).toEqual([
      {
        requester: { ownerId: OWNER, apiKeyId: KEY_ID },
        kind: 'envelope_save_to_drive',
        tool: 'envelopes_save_to_drive',
        args: { envelope_id: id, folder_id: FOLDER, folder_name: 'Contracts' },
        now: expect.any(Date),
      },
    ]);
  });

  it('needs a completed envelope of this owner, and a dry run asks nobody', async () => {
    const w = stepWorld();
    const id = await draft(w);
    // Not completed: the dry run says so (the real approval request checks the same).
    expect(
      err(
        await callStep(w, 'envelopes_save_to_drive', {
          idempotency_key: 'dry-00000010',
          dry_run: true,
          envelope_id: id,
          folder_id: FOLDER,
        }),
      ).slug,
    ).toBe('envelope_not_sealed');
    complete(w, id);
    const dry = ok(
      await callStep(w, 'envelopes_save_to_drive', {
        idempotency_key: 'dry-00000008',
        dry_run: true,
        envelope_id: id,
        folder_id: FOLDER,
      }),
    );
    expect(dry).toMatchObject({ dry_run: true, would: { uploads: false, folder_id: FOLDER } });
    expect(w.approvalCalls).toHaveLength(0);
    expect(
      err(
        await callStep(
          w,
          'envelopes_save_to_drive',
          {
            idempotency_key: 'dry-00000009',
            dry_run: true,
            envelope_id: id,
            folder_id: FOLDER,
          },
          { owner: OTHER_OWNER },
        ),
      ).slug,
    ).toBe('envelope_not_found');
  });

  it('takes a plain folder id only, needs gdrive:write and is hidden while Drive is off', async () => {
    const w = stepWorld();
    const id = await draft(w);
    complete(w, id);
    for (const folder_id of ['', 'has space', 'a/b', 'x'.repeat(257)]) {
      expect(
        err(await callStep(w, 'envelopes_save_to_drive', write({ envelope_id: id, folder_id })))
          .slug,
      ).toBe('validation_error');
    }
    expect(
      err(
        await callStep(
          w,
          'envelopes_save_to_drive',
          write({ envelope_id: id, folder_id: FOLDER }),
          {
            scopes: ['gdrive:read', 'envelopes:write'],
          },
        ),
      ).slug,
    ).toBe('insufficient_scope');
    const listed = listTools().find((t) => t.name === 'envelopes_save_to_drive');
    expect(listed?.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    expect(listed?.description).toContain('drive.file');
    setFlags({ gdriveIntegration: false });
    await expect(
      callStep(w, 'envelopes_save_to_drive', write({ envelope_id: id, folder_id: FOLDER })),
    ).rejects.toThrow('Tool not found');
    expect(w.approvalCalls).toHaveLength(0);
  });
});
