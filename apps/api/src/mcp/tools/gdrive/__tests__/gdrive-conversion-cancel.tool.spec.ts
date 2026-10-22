import {
  callWrite,
  err,
  ok,
  resetFlags,
  setFlags,
  write,
  writeWorld,
} from '../../__tests__/write-harness';

describe('gdrive_conversion_cancel', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('cancels a pending import; the dry run does not', async () => {
    const w = writeWorld();
    w.drive.files.set('drivefile0001', {
      id: 'drivefile0001',
      name: 'Doc',
      mimeType: 'application/pdf',
      size: 1,
    });
    w.drive.mode = 'pending';
    const job = ok(await callWrite(w, 'gdrive_import', write({ file_id: 'drivefile0001' })))[
      'job_id'
    ] as string;
    const dry = ok(
      await callWrite(w, 'gdrive_conversion_cancel', {
        job_id: job,
        idempotency_key: 'dry-key-0001',
        dry_run: true,
      }),
    );
    expect(dry).toEqual({ dry_run: true, would: { job_id: job } });
    expect(w.drive.jobs.get(job)?.status).toBe('converting');
    expect(ok(await callWrite(w, 'gdrive_conversion_cancel', write({ job_id: job })))).toEqual({
      cancelled: true,
    });
    expect(w.uploadsRepo.rows.size).toBe(0);
    expect(err(await callWrite(w, 'gdrive_conversion_cancel', write({ job_id: job }))).slug).toBe(
      'job_not_found_or_terminal',
    );
  });

  it('needs gdrive:read and documents:write', async () => {
    const w = writeWorld();
    expect(
      err(
        await callWrite(
          w,
          'gdrive_conversion_cancel',
          write({ job_id: '12345678-1234-4234-8234-123456789012' }),
          {
            scopes: ['gdrive:read'],
          },
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
