import { GdriveImportOutputSchema } from 'shared';
import { parseDriveShareUrl } from '../../../../uploads/drive-source.service';
import {
  OWNER,
  callWrite,
  err,
  ok,
  resetFlags,
  setFlags,
  write,
  writeWorld,
  type WriteWorld,
} from '../../__tests__/write-harness';

const FILE = 'drivefile0001';

function withFile(w: WriteWorld, mimeType = 'application/vnd.google-apps.document'): void {
  w.drive.files.set(FILE, { id: FILE, name: 'Q3 Contract', mimeType, size: null });
}

describe('gdrive_import', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('imports a picked file as a staged PDF with the Drive name recorded', async () => {
    const w = writeWorld();
    withFile(w);
    const out = ok(await callWrite(w, 'gdrive_import', write({ file_id: FILE })));
    expect(GdriveImportOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({
      status: 'done',
      document: { filename: 'Q3 Contract', page_count: 2, source: 'gdrive' },
    });
    const row = await w.uploadsRepo.find(
      OWNER,
      (out['document'] as { document_id: string }).document_id,
    );
    expect(row).toMatchObject({ drive_file_id: FILE, drive_file_name: 'Q3 Contract' });
    expect(row?.completed_at).not.toBeNull();
    // The conversion asset is cleaned up once copied.
    expect(w.storage.allPaths().filter((p) => p.startsWith('gdrive-conversions/'))).toEqual([]);
  });

  it('accepts a share_url and parses only Drive and Docs links', async () => {
    const w = writeWorld();
    withFile(w);
    const out = ok(
      await callWrite(
        w,
        'gdrive_import',
        write({ share_url: `https://docs.google.com/document/d/${FILE}/edit` }),
      ),
    );
    expect(out['status']).toBe('done');
    expect(parseDriveShareUrl(`https://drive.google.com/open?id=${FILE}`)).toBe(FILE);
    expect(parseDriveShareUrl(`https://evil.test/file/d/${FILE}/view`)).toBeNull();
    expect(parseDriveShareUrl(`http://drive.google.com/file/d/${FILE}/view`)).toBeNull();
    expect(
      err(await callWrite(w, 'gdrive_import', write({ share_url: 'https://evil.test/x' }))).slug,
    ).toBe('gdrive_share_url_invalid');
  });

  it('answers a file the app cannot read with gdrive_file_not_picked and a Seald picker link', async () => {
    const w = writeWorld();
    const out = err(await callWrite(w, 'gdrive_import', write({ file_id: 'notpicked0001' })));
    expect(out).toMatchObject({
      slug: 'gdrive_file_not_picked',
      url: 'https://seald.test/document/new',
    });
    expect(w.uploadsRepo.rows.size).toBe(0);
  });

  it('returns conversion_pending after the wait, then stages on poll', async () => {
    const w = writeWorld();
    withFile(w);
    w.drive.mode = 'pending';
    const pending = ok(await callWrite(w, 'gdrive_import', write({ file_id: FILE })));
    expect(pending).toMatchObject({ status: 'conversion_pending', document: null });
    const job = pending['job_id'] as string;
    expect(ok(await callWrite(w, 'gdrive_conversion_status', { job_id: job }))['status']).toBe(
      'conversion_pending',
    );
    w.drive.jobs.set(job, { jobId: job, status: 'done', assetUrl: 'https://x.test/a.pdf' });
    const done = ok(await callWrite(w, 'gdrive_conversion_status', { job_id: job }));
    expect(done).toMatchObject({ status: 'done', job_id: job, document: { page_count: 2 } });
    const again = ok(await callWrite(w, 'gdrive_conversion_status', { job_id: job }));
    expect(again['document']).toEqual(done['document']);
  });

  it('refuses a Sheet (not in the conversion allow-list) and a failed conversion', async () => {
    const w = writeWorld();
    withFile(w, 'application/vnd.google-apps.spreadsheet');
    expect(err(await callWrite(w, 'gdrive_import', write({ file_id: FILE }))).slug).toBe(
      'unsupported-mime',
    );
    withFile(w);
    w.drive.mode = 'failed';
    expect(err(await callWrite(w, 'gdrive_import', write({ file_id: FILE }))).slug).toBe(
      'conversion-failed',
    );
    expect(w.uploadsRepo.rows.size).toBe(0);
  });

  it('dry run resolves the account and file id without calling Google', async () => {
    const w = writeWorld();
    const out = ok(
      await callWrite(w, 'gdrive_import', {
        file_id: FILE,
        idempotency_key: 'dry-key-0001',
        dry_run: true,
      }),
    );
    expect(out).toMatchObject({ dry_run: true, would: { file_id: FILE } });
    expect(w.uploadsRepo.rows.size).toBe(0);
  });

  it('needs gdrive:read and documents:write, and exactly one of file_id or share_url', async () => {
    const w = writeWorld();
    withFile(w);
    expect(
      err(
        await callWrite(w, 'gdrive_import', write({ file_id: FILE }), { scopes: ['gdrive:read'] }),
      ).slug,
    ).toBe('insufficient_scope');
    expect(err(await callWrite(w, 'gdrive_import', write({}))).slug).toBe('validation_error');
    expect(
      err(
        await callWrite(
          w,
          'gdrive_import',
          write({ file_id: FILE, share_url: 'https://drive.google.com/x' }),
        ),
      ).slug,
    ).toBe('validation_error');
  });
});
