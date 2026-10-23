import {
  OTHER_OWNER,
  callWrite,
  err,
  ok,
  resetFlags,
  setFlags,
  write,
  writeWorld,
} from '../../__tests__/write-harness';

describe('gdrive_conversion_status', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  async function pendingJob() {
    const w = writeWorld();
    w.drive.files.set('drivefile0001', {
      id: 'drivefile0001',
      name: 'Doc',
      mimeType: 'application/pdf',
      size: 1,
    });
    w.drive.mode = 'pending';
    const out = ok(await callWrite(w, 'gdrive_import', write({ file_id: 'drivefile0001' })));
    return { w, job: out['job_id'] as string };
  }

  it('reports a failed job and drops its staging row', async () => {
    const { w, job } = await pendingJob();
    w.drive.jobs.set(job, { jobId: job, status: 'failed', errorCode: 'file-too-large' });
    expect(err(await callWrite(w, 'gdrive_conversion_status', { job_id: job })).slug).toBe(
      'file_too_large',
    );
    expect(w.uploadsRepo.rows.size).toBe(0);
  });

  it("is not found for another owner's job or an unknown one; needs both scopes", async () => {
    const { w, job } = await pendingJob();
    expect(
      err(await callWrite(w, 'gdrive_conversion_status', { job_id: job }, { owner: OTHER_OWNER }))
        .slug,
    ).toBe('job_not_found');
    expect(
      err(
        await callWrite(
          w,
          'gdrive_conversion_status',
          { job_id: job },
          { scopes: ['gdrive:read'] },
        ),
      ).slug,
    ).toBe('insufficient_scope');
    expect(err(await callWrite(w, 'gdrive_conversion_status', { job_id: 'nope' })).slug).toBe(
      'validation_error',
    );
  });
});
