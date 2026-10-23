import {
  OTHER_OWNER,
  callWrite,
  draft,
  err,
  ok,
  resetFlags,
  setFlags,
  write,
  writeWorld,
} from '../../__tests__/write-harness';

describe('envelopes_update', () => {
  afterEach(() => resetFlags());

  it('patches title, tags, expiry and the reminder cadence (WP-09)', async () => {
    setFlags();
    const w = writeWorld();
    const id = await draft(w);
    const expires = new Date('2026-10-20T10:00:00.000Z').toISOString();
    const out = ok(
      await callWrite(
        w,
        'envelopes_update',
        write({
          envelope_id: id,
          title: 'NDA v2',
          tags: ['Legal', 'legal', ' Q3 '],
          expires_at: expires,
          reminder_first_after_days: 2,
          reminder_interval_days: 3,
          reminder_max: 4,
          date_format: 'yyyy-MM-dd',
          timezone: 'Europe/Berlin',
        }),
      ),
    );
    expect(out).toMatchObject({
      title: 'NDA v2',
      tags: ['legal', 'q3'],
      expires_at: expires,
      reminder_first_after_days: 2,
      reminder_interval_days: 3,
      reminder_max: 4,
      date_format: 'yyyy-MM-dd',
      timezone: 'Europe/Berlin',
    });
  });

  it('enforces the 1–90 day expiry window while custom reminders are on', async () => {
    setFlags();
    const w = writeWorld();
    const id = await draft(w);
    const far = new Date('2027-06-01T00:00:00.000Z').toISOString();
    expect(
      err(await callWrite(w, 'envelopes_update', write({ envelope_id: id, expires_at: far }))).slug,
    ).toBe('validation_error');
  });

  it('rejects flag-gated keys while their flag is off, like the HTTP route', async () => {
    setFlags({ customReminders: false, fieldMetaV2: false });
    const w = writeWorld();
    const id = await draft(w);
    for (const extra of [{ reminder_max: 3 }, { date_format: 'yyyy-MM-dd' }]) {
      expect(
        err(await callWrite(w, 'envelopes_update', write({ envelope_id: id, ...extra }))).slug,
      ).toBe('validation_error');
      // The dry run applies the same rule.
      const dry = { envelope_id: id, ...extra, idempotency_key: 'dry-key-0001', dry_run: true };
      expect(err(await callWrite(w, 'envelopes_update', dry)).slug).toBe('validation_error');
    }
  });

  it('needs something to update, and the dry run does not write', async () => {
    setFlags();
    const w = writeWorld();
    const id = await draft(w);
    expect(err(await callWrite(w, 'envelopes_update', write({ envelope_id: id }))).slug).toBe(
      'validation_error',
    );
    const dry = ok(
      await callWrite(w, 'envelopes_update', {
        envelope_id: id,
        title: 'Changed',
        idempotency_key: 'dry-key-0002',
        dry_run: true,
      }),
    );
    expect(dry).toMatchObject({ dry_run: true, would: { patch: { title: 'Changed' } } });
    expect(
      ok(await callWrite(w, 'envelopes_get', { envelope_id: id }, { scopes: ['envelopes:read'] }))[
        'title'
      ],
    ).toBe('NDA');
  });

  it("answers another owner's envelope as not found, and needs envelopes:write", async () => {
    setFlags();
    const w = writeWorld();
    const id = await draft(w, 'Theirs', OTHER_OWNER);
    expect(
      err(await callWrite(w, 'envelopes_update', write({ envelope_id: id, title: 'x' }))).slug,
    ).toBe('envelope_not_found');
    expect(
      err(
        await callWrite(w, 'envelopes_update', write({ envelope_id: id, title: 'x' }), {
          scopes: ['envelopes:read'],
        }),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
