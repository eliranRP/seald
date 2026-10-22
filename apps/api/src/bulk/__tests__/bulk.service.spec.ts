import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BULK_SEND_MAX_FILE_BYTES, BULK_SEND_MAX_ROWS, type FeatureFlag } from 'shared';
import type { AuthUser } from '../../auth/auth-user';
import { InMemoryBulkRepository } from '../../../test/in-memory-bulk-repository';
import { InMemoryOutboundEmailsRepository } from '../../../test/in-memory-outbound-emails-repository';
import { InMemoryTemplatesRepository } from '../../../test/in-memory-templates-repository';
import type { AppEnv } from '../../config/env.schema';
import { BulkSummaryService } from '../bulk-summary.service';
import { BulkService, parseBulkOptions } from '../bulk.service';

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

const OWNER = '00000000-0000-4000-8000-00000000000a';
const OTHER = '00000000-0000-4000-8000-00000000000b';
const user = (id = OWNER, email: string | null = 'sender@example.com'): AuthUser => ({
  id,
  email,
  provider: 'email',
});
const HEAD = 'recipient_1_name,recipient_1_email';
const csv = (...rows: string[]) => ({ buffer: Buffer.from([HEAD, ...rows].join('\n')) });

describe('BulkService', () => {
  let repo: InMemoryBulkRepository;
  let templates: InMemoryTemplatesRepository;
  let outbound: InMemoryOutboundEmailsRepository;
  let svc: BulkService;
  let templateId: string;

  beforeEach(async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = {};
    repo = new InMemoryBulkRepository();
    templates = new InMemoryTemplatesRepository();
    outbound = new InMemoryOutboundEmailsRepository();
    const summary = new BulkSummaryService(repo, outbound, {
      APP_PUBLIC_URL: 'https://seald.test',
    } as AppEnv);
    svc = new BulkService(repo, templates, summary);
    const t = await templates.create({
      owner_id: OWNER,
      title: 'NDA',
      description: null,
      cover_color: null,
      field_layout: [{ type: 'signature', pageRule: 'last', x: 1, y: 1, signerRoleId: 'a' }],
      tags: [],
      last_signers: [],
    });
    await templates.setExamplePdfPath(OWNER, t.id, 'templates/x/example.pdf');
    templateId = t.id;
  });

  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  describe('createBatch', () => {
    it('stores a preview with the sender identity from the session', async () => {
      const batch = await svc.createBatch(user(), templateId, csv('Ada,ada@example.com'), {});
      expect(batch).toMatchObject({ status: 'preview', confirmable: true, template_title: 'NDA' });
      const stored = [...repo.batches.values()][0];
      expect(stored).toMatchObject({ sender_email: 'sender@example.com', slot_count: 1 });
      expect(stored?.csv_sha256).toHaveLength(64);
    });

    it('needs a sender mailbox (a guest session has none)', async () => {
      await expect(
        svc.createBatch(user(OWNER, null), templateId, csv('Ada,ada@example.com'), {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a missing, empty, oversized or non-UTF-8 file', async () => {
      await expect(svc.createBatch(user(), templateId, undefined, {})).rejects.toThrow(
        'bulk_csv_required',
      );
      await expect(
        svc.createBatch(user(), templateId, { buffer: Buffer.alloc(0) }, {}),
      ).rejects.toThrow('bulk_csv_required');
      await expect(
        svc.createBatch(
          user(),
          templateId,
          { buffer: Buffer.alloc(BULK_SEND_MAX_FILE_BYTES + 1, 97) },
          {},
        ),
      ).rejects.toThrow('bulk_file_too_large');
      await expect(
        svc.createBatch(user(), templateId, { buffer: Buffer.from([0xff, 0xfe, 0x41]) }, {}),
      ).rejects.toThrow('bulk_csv_not_utf8');
    });

    it('counts the row cap on data rows, not blank lines', async () => {
      const rows = Array.from({ length: BULK_SEND_MAX_ROWS }, (_, i) => `P${i},p${i}@example.com`);
      const padded = [HEAD, '', ...rows, '', ''].join('\n');
      await expect(
        svc.createBatch(user(), templateId, { buffer: Buffer.from(padded) }, {}),
      ).resolves.toMatchObject({ counts: { total: BULK_SEND_MAX_ROWS } });
      await expect(
        svc.createBatch(
          user(),
          templateId,
          { buffer: Buffer.from([HEAD, ...rows, 'X,x@example.com'].join('\n')) },
          {},
        ),
      ).rejects.toThrow('bulk_too_many_rows');
    });

    it('never mixes owners: another user sees template_not_found', async () => {
      await expect(
        svc.createBatch(user(OTHER, 'o@example.com'), templateId, csv('Ada,ada@example.com'), {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses an unsendable template with the reason as the slug', async () => {
      const bare = await templates.create({
        owner_id: OWNER,
        title: 'Empty',
        description: null,
        cover_color: null,
        field_layout: [],
        tags: [],
        last_signers: [],
      });
      await expect(
        svc.createBatch(user(), bare.id, csv('Ada,ada@example.com'), {}),
      ).rejects.toThrow('template_has_no_fields');
    });
  });

  describe('confirm', () => {
    it('moves a valid preview to processing and is idempotent', async () => {
      const batch = await svc.createBatch(user(), templateId, csv('Ada,ada@example.com'), {});
      expect((await svc.confirm(OWNER, batch.id)).status).toBe('processing');
      expect((await svc.confirm(OWNER, batch.id)).status).toBe('processing');
    });

    it('refuses a preview whose rows are all invalid', async () => {
      const batch = await svc.createBatch(user(), templateId, csv('Ada,nope'), {});
      expect(batch.confirmable).toBe(false);
      await expect(svc.confirm(OWNER, batch.id)).rejects.toThrow('bulk_no_valid_rows');
    });

    it('expires a preview after 24 hours', async () => {
      const batch = await svc.createBatch(user(), templateId, csv('Ada,ada@example.com'), {});
      const later = new Date(Date.now() + 25 * 3_600_000);
      await expect(svc.confirm(OWNER, batch.id, later)).rejects.toThrow('bulk_preview_expired');
    });

    it('refuses when the template was deleted or lost its document', async () => {
      const batch = await svc.createBatch(user(), templateId, csv('Ada,ada@example.com'), {});
      await templates.setExamplePdfPath(OWNER, templateId, null);
      await expect(svc.confirm(OWNER, batch.id)).rejects.toThrow(ConflictException);
      await expect(svc.confirm(OWNER, batch.id)).rejects.toThrow('bulk_template_changed');
    });

    it('404s for another owner', async () => {
      const batch = await svc.createBatch(user(), templateId, csv('Ada,ada@example.com'), {});
      await expect(svc.confirm(OTHER, batch.id)).rejects.toThrow('bulk_batch_not_found');
    });
  });

  describe('get and cancel', () => {
    it('reports counts and falls back to generic slot labels once the template is gone', async () => {
      const batch = await svc.createBatch(
        user(),
        templateId,
        csv('Ada,ada@example.com', 'Bob,bad'),
        {},
      );
      await templates.delete(OWNER, templateId);
      const got = await svc.get(OWNER, batch.id);
      expect(got.slots.map((s) => s.label)).toEqual(['Signer 1']);
      expect(got.counts).toMatchObject({ total: 2, invalid: 1, pending: 1 });
    });

    it('cancels a processing batch with nothing in flight and queues the summary', async () => {
      const batch = await svc.createBatch(user(), templateId, csv('Ada,ada@example.com'), {});
      await svc.confirm(OWNER, batch.id);
      const canceled = await svc.cancel(OWNER, batch.id);
      expect(canceled).toMatchObject({ status: 'canceled', counts: { canceled: 1, pending: 0 } });
      expect(canceled.completed_at).not.toBeNull();
      expect(outbound.rows.filter((r) => r.kind === 'bulk_complete')).toHaveLength(1);
    });

    it('holds the summary while a row is still being sent', async () => {
      const batch = await svc.createBatch(user(), templateId, csv('Ada,ada@example.com'), {});
      await svc.confirm(OWNER, batch.id);
      const row = await repo.claimNextRow(new Date(), new Date(0), {
        windowStart: new Date(0),
        maxPerWindow: 10,
      });
      expect(row).not.toBeNull();
      const canceled = await svc.cancel(OWNER, batch.id);
      expect(canceled.completed_at).toBeNull();
      expect(outbound.rows).toHaveLength(0);
    });
  });
});

describe('parseBulkOptions', () => {
  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  it('returns nothing for empty input and accepts parallel', () => {
    expect(parseBulkOptions({})).toEqual({});
    expect(parseBulkOptions({ signing_order: 'parallel', expires_in_days: '' })).toEqual({});
  });

  it('bounds the expiry', () => {
    expect(parseBulkOptions({ expires_in_days: '14' })).toEqual({ expires_in_days: 14 });
    for (const bad of ['0', '91', '1.5', 'abc']) {
      expect(() => parseBulkOptions({ expires_in_days: bad })).toThrow('bulk_options_invalid');
    }
  });

  it('allows sequential order and reminders only with their flags on', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = {};
    expect(() => parseBulkOptions({ signing_order: 'sequential' })).toThrow('bulk_options_invalid');
    const reminder = {
      reminder_first_after_days: '2',
      reminder_interval_days: '3',
      reminder_max: '4',
    };
    expect(() => parseBulkOptions(reminder)).toThrow('bulk_options_invalid');
    host.__SEALD_FEATURE_OVERRIDES__ = { signingOrder: true, customReminders: true };
    expect(parseBulkOptions({ signing_order: 'sequential', ...reminder })).toEqual({
      signing_order: 'sequential',
      reminder: { first_after_days: 2, interval_days: 3, max: 4 },
    });
    expect(() => parseBulkOptions({ reminder_first_after_days: '2' })).toThrow(
      'bulk_options_invalid',
    );
    expect(() => parseBulkOptions({ ...reminder, reminder_max: '99' })).toThrow(
      'bulk_options_invalid',
    );
  });
});
