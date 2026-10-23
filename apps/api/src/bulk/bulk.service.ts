import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BULK_SEND_MAX_FILE_BYTES,
  BULK_SEND_MAX_ROWS,
  BULK_SEND_PREVIEW_TTL_HOURS,
  EXPIRY_MAX_DAYS,
  EXPIRY_MIN_DAYS,
  bulkColumnNames,
  isFeatureEnabled,
  isReminderCadenceValid,
  type BulkBatch,
  type BulkBatchRow,
  type BulkSchema,
  type BulkSlot,
  type Template,
} from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { resolveSenderIdentity } from '../envelopes/sender-identity';
import { TemplatesRepository } from '../templates/templates.repository';
import { countRows } from './bulk-complete-email';
import { BULK_TITLE_COLUMN, deriveSlots, validateBulkCsv, type ValidatedCsv } from './bulk-schema';
import { BulkSummaryService } from './bulk-summary.service';
import {
  BulkRepository,
  type BulkBatchRecord,
  type BulkOptions,
  type BulkRowRecord,
} from './bulk.repository';
import { CsvParseError, parseCsv, type CsvRecord } from './csv-parser';

/** One row an agent passed: a title and one signer per template slot. */
export interface BulkAgentRow {
  readonly title?: string | undefined;
  readonly signers: ReadonlyArray<{ readonly name: string; readonly email: string }>;
}

/** Raw multipart text fields that carry the batch options. */
export type BulkOptionFields = Readonly<Record<string, unknown>>;

function fallbackSlots(count: number): BulkSlot[] {
  return Array.from({ length: count }, (_, i) => {
    const cols = bulkColumnNames(i + 1);
    return {
      slot: i + 1,
      label: `Signer ${i + 1}`,
      name_column: cols.name,
      email_column: cols.email,
    };
  });
}

function intField(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' && typeof raw !== 'number')
    throw new BadRequestException('bulk_options_invalid');
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n)) throw new BadRequestException('bulk_options_invalid');
  return n;
}

/** Sender choices from the multipart fields; anything the flags do not allow is a 400. */
export function parseBulkOptions(fields: BulkOptionFields): BulkOptions {
  const out: { -readonly [K in keyof BulkOptions]: BulkOptions[K] } = {};
  const days = intField(fields['expires_in_days']);
  if (days !== undefined) {
    if (days < EXPIRY_MIN_DAYS || days > EXPIRY_MAX_DAYS) {
      throw new BadRequestException('bulk_options_invalid');
    }
    out.expires_in_days = days;
  }
  const order = fields['signing_order'];
  if (order === 'sequential') {
    if (!isFeatureEnabled('signingOrder')) throw new BadRequestException('bulk_options_invalid');
    out.signing_order = 'sequential';
  } else if (order !== undefined && order !== '' && order !== 'parallel') {
    throw new BadRequestException('bulk_options_invalid');
  }
  const first = intField(fields['reminder_first_after_days']);
  const interval = intField(fields['reminder_interval_days']);
  const max = intField(fields['reminder_max']);
  if (first !== undefined || interval !== undefined || max !== undefined) {
    if (
      first === undefined ||
      interval === undefined ||
      max === undefined ||
      !isFeatureEnabled('customReminders') ||
      !isReminderCadenceValid({ firstAfterDays: first, intervalDays: interval, maxReminders: max })
    ) {
      throw new BadRequestException('bulk_options_invalid');
    }
    out.reminder = { first_after_days: first, interval_days: interval, max };
  }
  return out;
}

/**
 * Sender-facing bulk send: build a preview from a CSV, confirm it, read its
 * progress, cancel what is left. The per-row work is the worker's
 * (`BulkWorkerService`); nothing here sends an envelope.
 */
@Injectable()
export class BulkService {
  constructor(
    private readonly repo: BulkRepository,
    private readonly templates: TemplatesRepository,
    private readonly summary: BulkSummaryService,
  ) {}

  async schema(owner_id: string, template_id: string): Promise<BulkSchema> {
    const { template, slots } = await this.loadSendable(owner_id, template_id);
    return {
      template_id: template.id,
      template_title: template.title,
      slots,
      optional_columns: [BULK_TITLE_COLUMN],
      max_rows: BULK_SEND_MAX_ROWS,
      max_file_bytes: BULK_SEND_MAX_FILE_BYTES,
    };
  }

  async createBatch(
    user: AuthUser,
    template_id: string,
    file: { readonly buffer: Buffer; readonly originalname?: string } | undefined,
    optionFields: BulkOptionFields,
  ): Promise<BulkBatch> {
    const sender = resolveSenderIdentity(user);
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('bulk_csv_required');
    }
    if (file.buffer.length > BULK_SEND_MAX_FILE_BYTES) {
      throw new PayloadTooLargeException('bulk_file_too_large');
    }
    const options = parseBulkOptions(optionFields);
    const { template, slots } = await this.loadSendable(user.id, template_id);

    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.buffer);
    } catch {
      throw new BadRequestException('bulk_csv_not_utf8');
    }
    let records;
    try {
      records = parseCsv(text);
    } catch (err) {
      if (err instanceof CsvParseError) throw new BadRequestException('bulk_csv_malformed');
      throw err;
    }
    const dataRows = records.length - 1;
    if (records.length === 0 || dataRows < 1) throw new BadRequestException('bulk_csv_no_rows');
    if (dataRows > BULK_SEND_MAX_ROWS) throw new UnprocessableEntityException('bulk_too_many_rows');

    const validated = validateBulkCsv(records, slots);
    const batch = await this.repo.createPreview(
      {
        owner_id: user.id,
        template_id: template.id,
        template_title: template.title,
        sender_email: sender.email,
        sender_name: sender.name,
        filename: file.originalname ? file.originalname.slice(0, 255) : null,
        csv_sha256: createHash('sha256').update(file.buffer).digest('hex'),
        slot_count: slots.length,
        options,
        column_errors: validated.column_errors,
        ignored_columns: validated.ignored_columns,
      },
      validated.rows.map((r) => ({
        row_index: r.row,
        recipients: r.recipients,
        title: r.title,
        errors: r.errors,
      })),
    );
    return this.toWire(batch, await this.repo.listRows(batch.id), slots);
  }

  /**
   * WP-26 (MCP): check the rows an agent passed against the template's
   * slots, without writing. Rows are `{ title?, signers }` with one signer
   * per slot in slot order; the same row rules as a CSV apply.
   */
  async validateRows(
    owner_id: string,
    template_id: string,
    rows: ReadonlyArray<BulkAgentRow>,
  ): Promise<{
    readonly template: Template;
    readonly slots: ReadonlyArray<BulkSlot>;
    readonly validated: ValidatedCsv;
    readonly records: ReadonlyArray<CsvRecord>;
  }> {
    const { template, slots } = await this.loadSendable(owner_id, template_id);
    if (rows.some((r) => r.signers.length !== slots.length)) {
      throw new UnprocessableEntityException('template_signer_count_mismatch');
    }
    const header: string[] = [];
    for (const slot of slots) header.push(slot.name_column, slot.email_column);
    header.push(BULK_TITLE_COLUMN);
    const records: CsvRecord[] = [
      { record: 1, cells: header },
      ...rows.map((r, i) => ({
        record: i + 2,
        cells: [...r.signers.flatMap((s) => [s.name, s.email]), r.title ?? ''],
      })),
    ];
    return { template, slots, validated: validateBulkCsv(records, slots), records };
  }

  /**
   * WP-26 (MCP): a preview batch from rows an agent passed. Every row must
   * be valid; one bad row fails the call with `bulk_rows_invalid` and
   * writes nothing, so the owner approves exactly the rows that will send.
   * Nothing is sent until {@link confirmForAgent}.
   */
  async createFromRows(
    owner: { readonly id: string; readonly email: string },
    template_id: string,
    rows: ReadonlyArray<BulkAgentRow>,
  ): Promise<BulkBatch> {
    const sender = resolveSenderIdentity({ email: owner.email });
    const { template, slots, validated, records } = await this.validateRows(
      owner.id,
      template_id,
      rows,
    );
    if (validated.rows.some((r) => r.errors.length > 0)) {
      throw new UnprocessableEntityException('bulk_rows_invalid');
    }
    const batch = await this.repo.createPreview(
      {
        owner_id: owner.id,
        template_id: template.id,
        template_title: template.title,
        sender_email: sender.email,
        sender_name: sender.name,
        filename: null,
        csv_sha256: createHash('sha256').update(JSON.stringify(records)).digest('hex'),
        slot_count: slots.length,
        options: {},
        column_errors: validated.column_errors,
        ignored_columns: validated.ignored_columns,
      },
      validated.rows.map((r) => ({
        row_index: r.row,
        recipients: r.recipients,
        title: r.title,
        errors: r.errors,
      })),
    );
    return this.toWire(batch, await this.repo.listRows(batch.id), slots);
  }

  /**
   * WP-26 (MCP): confirm a batch the owner approved. The attribution is
   * stored on the batch first, so every envelope the worker sends for it
   * carries `metadata.mcp`.
   */
  async confirmForAgent(
    owner_id: string,
    id: string,
    attribution: Pick<BulkOptions, 'mcp' | 'new_recipient_emails'>,
    now: Date = new Date(),
  ): Promise<BulkBatch> {
    const batch = await this.requireBatch(owner_id, id);
    if (batch.status === 'preview') {
      await this.repo.mergePreviewOptions(owner_id, id, attribution);
    }
    return this.confirm(owner_id, id, now);
  }

  async get(owner_id: string, id: string): Promise<BulkBatch> {
    const batch = await this.requireBatch(owner_id, id);
    return this.toWire(batch, await this.repo.listRows(id));
  }

  async confirm(owner_id: string, id: string, now: Date = new Date()): Promise<BulkBatch> {
    const batch = await this.requireBatch(owner_id, id);
    if (batch.status === 'processing' || batch.status === 'completed') {
      return this.get(owner_id, id); // already confirmed: repeating it is harmless
    }
    if (batch.status === 'canceled') throw new ConflictException('bulk_batch_canceled');
    if (now.getTime() - Date.parse(batch.created_at) > BULK_SEND_PREVIEW_TTL_HOURS * 3_600_000) {
      throw new ConflictException('bulk_preview_expired');
    }
    if (batch.valid_rows === 0) throw new ConflictException('bulk_no_valid_rows');
    // The template may have changed since the preview.
    let slotCount: number | null = null;
    if (batch.template_id !== null) {
      try {
        slotCount = (await this.loadSendable(owner_id, batch.template_id)).slots.length;
      } catch {
        slotCount = null;
      }
    }
    if (slotCount !== batch.slot_count) throw new ConflictException('bulk_template_changed');
    await this.repo.confirm(owner_id, id, now);
    return this.get(owner_id, id);
  }

  async cancel(owner_id: string, id: string, now: Date = new Date()): Promise<BulkBatch> {
    const batch = await this.requireBatch(owner_id, id);
    if (batch.status === 'completed') throw new ConflictException('bulk_batch_completed');
    if (batch.status !== 'canceled') {
      await this.repo.cancel(owner_id, id, now);
      // No row in flight: close it and send the summary now.
      await this.summary.finishAndNotify(id, now);
    }
    return this.get(owner_id, id);
  }

  private async requireBatch(owner_id: string, id: string): Promise<BulkBatchRecord> {
    const batch = await this.repo.findBatchForOwner(owner_id, id);
    if (!batch) throw new NotFoundException('bulk_batch_not_found');
    return batch;
  }

  private async loadSendable(
    owner_id: string,
    template_id: string,
  ): Promise<{ template: Template; slots: ReadonlyArray<BulkSlot> }> {
    const template = await this.templates.findOneByOwner(owner_id, template_id);
    if (!template) throw new NotFoundException('template_not_found');
    const derived = deriveSlots(template);
    if (!derived.ok) throw new UnprocessableEntityException(derived.reason);
    const pdf = await this.templates.getExamplePdfPath(owner_id, template_id);
    if (!pdf) throw new UnprocessableEntityException('template_has_no_example_pdf');
    return { template, slots: derived.slots };
  }

  private async toWire(
    batch: BulkBatchRecord,
    rows: ReadonlyArray<BulkRowRecord>,
    knownSlots?: ReadonlyArray<BulkSlot>,
  ): Promise<BulkBatch> {
    let slots = knownSlots;
    if (!slots) {
      const template =
        batch.template_id === null
          ? null
          : await this.templates.findOneByOwner(batch.owner_id, batch.template_id);
      const derived = template ? deriveSlots(template) : null;
      slots =
        derived && derived.ok && derived.slots.length === batch.slot_count
          ? derived.slots
          : fallbackSlots(batch.slot_count);
    }
    const c = countRows(rows);
    const pending = rows.filter((r) => r.status === 'pending').length;
    const processing = rows.filter((r) => r.status === 'processing').length;
    const expired =
      Date.now() - Date.parse(batch.created_at) > BULK_SEND_PREVIEW_TTL_HOURS * 3_600_000;
    return {
      id: batch.id,
      template_id: batch.template_id,
      template_title: batch.template_title,
      status: batch.status,
      filename: batch.filename,
      slots,
      column_errors: batch.column_errors,
      ignored_columns: batch.ignored_columns,
      counts: {
        total: c.total,
        invalid: c.invalid,
        pending,
        processing,
        sent: c.sent,
        failed: c.failed,
        canceled: c.canceled,
      },
      confirmable: batch.status === 'preview' && batch.valid_rows > 0 && !expired,
      rows: rows.map(
        (r): BulkBatchRow => ({
          row: r.row_index,
          status: r.status,
          recipients: r.recipients,
          title: r.title,
          errors: r.errors,
          envelope_id: r.envelope_id,
          error_code: r.error_code,
        }),
      ),
      created_at: batch.created_at,
      confirmed_at: batch.confirmed_at,
      completed_at: batch.completed_at,
      canceled_at: batch.canceled_at,
    };
  }
}
