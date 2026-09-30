import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DEFAULT_FIELD_SIZE_PT, type PlacementKind } from 'shared';
import type { CreateFieldInput, FieldUpdateById } from '../../envelopes/envelopes.repository';
import {
  ANCHOR_TEXT,
  buildAcroForm,
  buildLetter,
  buildMixed,
  buildPrompt,
  buildTwoWords,
  LEGAL,
  LETTER,
  PROMPT_TEXT,
} from '../__fixtures__/build-fixtures';
import { FieldPlacementService } from '../field-placement.service';
import type { PlacementBoxInput, PlacementFieldInput } from '../field-placement.types';
import { stopPdfWorker } from '../pdfjs-host';
import type {
  PlacementEnvelope,
  PlacementSigner,
  PlacementStore,
  PlacementStoredField,
} from '../placement-store';

const OWNER = 'owner-1';
const ENVELOPE = 'env-1';
const SIGNER = 'signer-1';

class MemoryStore implements PlacementStore {
  writes = 0;
  updates = 0;
  status = 'draft';
  path: string | null = 'original.pdf';
  bytes = Buffer.alloc(0);
  signers: PlacementSigner[] = [{ id: SIGNER, name: 'Ada', color: '#336699' }];
  fields: PlacementStoredField[] = [];
  private nextId = 1;

  async load(): Promise<PlacementEnvelope> {
    return {
      id: ENVELOPE,
      status: this.status,
      original_file_path: this.path,
      signers: this.signers,
      fields: this.fields,
    };
  }

  async download(): Promise<Buffer> {
    return this.bytes;
  }

  async replaceFields(
    _owner: string,
    _envelope: string,
    fields: readonly CreateFieldInput[],
  ): Promise<readonly PlacementStoredField[]> {
    this.writes += 1;
    this.fields = fields.map((field) => ({
      id: `fld-${this.nextId++}`,
      signer_id: field.signer_id,
      kind: field.kind,
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width ?? null,
      height: field.height ?? null,
      required: field.required ?? true,
      link_id: field.link_id ?? null,
    }));
    return this.fields;
  }

  async updateFieldsById(
    _envelope: string,
    updates: readonly FieldUpdateById[],
    remove: readonly string[],
  ): Promise<readonly PlacementStoredField[]> {
    this.updates += 1;
    const removed = new Set(remove);
    const next = this.fields.filter((field) => !removed.has(field.id));
    for (const update of updates) {
      const index = next.findIndex((field) => field.id === update.field_id);
      const current = next[index];
      if (!current) throw new Error('field_not_found');
      next[index] = {
        ...current,
        signer_id: update.signer_id,
        kind: update.kind,
        page: update.page,
        x: update.x,
        y: update.y,
        width: update.width,
        height: update.height,
        required: update.required,
        link_id: update.link_id,
      };
    }
    this.fields = next;
    return next;
  }
}

function box(
  page: number,
  x: number,
  y: number,
  width?: number,
  height?: number,
): PlacementBoxInput {
  return {
    page,
    x,
    y,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

function signatureAt(
  x: number,
  y: number,
  extra?: Partial<PlacementFieldInput>,
): PlacementFieldInput {
  return {
    signer_id: SIGNER,
    kind: 'signature',
    box: box(1, x, y, 180, 50),
    ...extra,
  };
}

function slugs(issues: readonly { slug: string }[]): string[] {
  return issues.map((issue) => issue.slug);
}

async function expectHttp(
  run: () => Promise<unknown>,
  type: new (...args: never[]) => Error,
  code: string,
): Promise<void> {
  await expect(run()).rejects.toBeInstanceOf(type);
  await expect(run()).rejects.toThrow(code);
}

afterAll(async () => {
  await stopPdfWorker();
});

describe('FieldPlacementService', () => {
  jest.setTimeout(60_000);

  let store: MemoryStore;
  let service: FieldPlacementService;

  beforeEach(async () => {
    store = new MemoryStore();
    store.bytes = Buffer.from((await buildLetter()).bytes);
    service = new FieldPlacementService(store);
  });

  it('inspects pages, line text, and a cursor cap', async () => {
    const inspected = await service.inspectDocument({ owner_id: OWNER, envelope_id: ENVELOPE });
    expect(inspected.units).toBe('pdf_points_top_left_displayed');
    expect(inspected.page_count).toBe(1);
    expect(inspected.pages[0]?.view_width).toBeCloseTo(LETTER.width, 2);
    expect(inspected.pages[0]?.view_height).toBeCloseTo(LETTER.height, 2);
    expect(inspected.text_granularity).toBe('line');
    expect(inspected.text.some((item) => item.text.includes(ANCHOR_TEXT))).toBe(true);
    expect(inspected.next_cursor).toBeNull();

    store.bytes = Buffer.from((await buildTwoWords()).bytes);
    const words = await service.inspectDocument({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      text_granularity: 'word',
    });
    expect(words.text.map((item) => item.text)).toEqual(expect.arrayContaining(['Hello', 'World']));
    expect(words.text.some((item) => item.text === 'Hello World')).toBe(false);

    store.bytes = Buffer.from((await buildMixed()).bytes);
    const page = await service.inspectDocument({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      pages: [3],
    });
    expect(page.page_count).toBe(3);
    expect(page.pages).toHaveLength(1);
    expect(page.pages[0]?.view_width).toBeCloseTo(LEGAL.width, 2);
    expect(page.pages[0]?.view_height).toBeCloseTo(LEGAL.height, 2);

    const tooMany = Array.from({ length: 51 }, () => 1);
    await expectHttp(
      () => service.inspectDocument({ owner_id: OWNER, envelope_id: ENVELOPE, pages: tooMany }),
      BadRequestException,
      'inspect_pages_limit',
    );
    await expectHttp(
      () => service.inspectDocument({ owner_id: OWNER, envelope_id: ENVELOPE, cursor: 'abc' }),
      BadRequestException,
      'inspect_cursor_invalid',
    );
    const past = Buffer.from('5000', 'utf8').toString('base64url');
    const empty = await service.inspectDocument({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      cursor: past,
    });
    expect(empty.text).toEqual([]);
    expect(empty.next_cursor).toBeNull();
  });

  it('returns every validation slug without throwing, and never puts document text in message', async () => {
    const page = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [signatureAt(72, 120, { box: box(9, 72, 120, 180, 50), client_ref: 'p9' })],
    });
    expect(slugs(page.report.errors)).toContain('field_page_out_of_range');
    const zero = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [signatureAt(72, 120, { box: box(0, 72, 120, 180, 50) })],
    });
    expect(slugs(zero.report.errors)).toContain('field_page_out_of_range');
    expect(store.writes).toBe(0);

    const bounds = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [signatureAt(-20, 40)],
    });
    const boundsIssue = bounds.report.errors.find((issue) => issue.slug === 'field_out_of_bounds');
    expect(boundsIssue?.message).toContain('20.00 pt left');
    expect(boundsIssue?.retryable).toBe(false);

    const small = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [signatureAt(72, 120, { box: box(1, 72, 120, 20, 10) })],
    });
    expect(slugs(small.report.errors)).toContain('field_too_small');
    const exact = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [signatureAt(72, 200, { box: box(1, 72, 200, 60, 20) })],
    });
    expect(slugs(exact.report.errors)).not.toContain('field_too_small');

    const overlap = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [
        signatureAt(72, 200, { client_ref: 'left' }),
        signatureAt(80, 210, { client_ref: 'right' }),
      ],
    });
    const overlapIssue = overlap.report.errors.find((issue) => issue.slug === 'fields_overlap');
    expect(overlapIssue?.message).toBe('Fields left and right overlap.');
    const touching = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [
        signatureAt(72, 200, { box: box(1, 72, 200, 100, 40), client_ref: 'a' }),
        signatureAt(172, 200, { box: box(1, 172, 200, 100, 40), client_ref: 'b' }),
      ],
    });
    expect(slugs(touching.report.errors)).not.toContain('fields_overlap');

    store.bytes = Buffer.from((await buildPrompt()).bytes);
    const covered = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [signatureAt(40, 360, { box: box(1, 40, 360, 400, 40) })],
    });
    const cover = covered.report.warnings.find((issue) => issue.slug === 'field_covers_text');
    expect(cover?.message).toBe('Field covers more than 25% of a text line.');
    expect(JSON.stringify(cover?.next_steps)).not.toContain(PROMPT_TEXT);
    expect(cover?.nearest_text?.text).toBe(PROMPT_TEXT);
    expect(covered.persisted).toBe(true);

    const missingSigner = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [signatureAt(72, 200, { signer_id: 'nope' })],
    });
    expect(slugs(missingSigner.report.errors)).toContain('signer_not_in_envelope');
    expect(missingSigner.persisted).toBe(false);

    const locator = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [
        {
          signer_id: SIGNER,
          kind: 'signature',
          client_ref: 'both',
          box: box(1, 72, 200, 180, 50),
          anchor: { text: ANCHOR_TEXT },
        },
        signatureAt(72, 300, { client_ref: 'later' }),
      ],
    });
    expect(slugs(locator.report.errors)).toContain('invalid_field_locator');
    expect(locator.fields.map((field) => field.client_ref)).toEqual(['later']);
    const unknownKind = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [{ signer_id: SIGNER, kind: 'seal', box: box(1, 72, 200, 180, 50) }],
    });
    expect(slugs(unknownKind.report.errors)).toContain('invalid_field_locator');
    expect(unknownKind.fields).toEqual([]);

    const missingAnchor = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [
        {
          signer_id: SIGNER,
          kind: 'signature',
          anchor: { text: 'MissingAnchorXYZ' },
        },
      ],
    });
    const notFound = missingAnchor.report.errors.find((issue) => issue.slug === 'anchor_not_found');
    expect(notFound?.match_count).toBe(0);
    expect(notFound?.message).toBe('Anchor text was not found (match_count 0).');

    store.bytes = Buffer.from((await buildLetter()).bytes);
    const occurrence = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [
        {
          signer_id: SIGNER,
          kind: 'signature',
          anchor: { text: ANCHOR_TEXT, occurrence: 4 },
        },
      ],
    });
    const range = occurrence.report.errors.find(
      (issue) => issue.slug === 'anchor_occurrence_out_of_range',
    );
    expect(range?.match_count).toBe(1);

    store.bytes = Buffer.from((await buildAcroForm()).bytes);
    const writesBeforeMiss = store.writes;
    const form = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [{ signer_id: SIGNER, form_field: { name: 'NoSuchField' } }],
    });
    expect(slugs(form.report.errors)).toContain('form_field_not_found');
    expect(store.writes).toBe(writesBeforeMiss);
  });

  it('persists warnings, skips errors and dry runs, and keeps update ids', async () => {
    const dry = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      dry_run: true,
      fields: [signatureAt(72, 200, { client_ref: 'dry', label: 'Sign here' })],
    });
    expect(dry.persisted).toBe(false);
    expect(dry.fields[0]?.id).toBeNull();
    expect(dry.fields[0]?.client_ref).toBe('dry');
    expect(dry.fields[0]?.label).toBe('Sign here');
    expect(dry.fields[0]?.source).toBe('box');
    expect(store.writes).toBe(0);

    const textOnly = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [
        {
          signer_id: SIGNER,
          kind: 'text',
          box: box(1, 72, 200, 180, 24),
        },
      ],
    });
    expect(slugs(textOnly.report.warnings)).toContain('signer_without_signature_field');
    expect(slugs(textOnly.report.envelope_errors)).toContain('signer_without_signature_field');
    expect(textOnly.report.ready).toBe(true);
    expect(textOnly.persisted).toBe(true);
    const textId = textOnly.fields[0]?.id;
    expect(textId).toEqual(expect.any(String));

    const preview = await service.validateFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      stage: 'preview',
    });
    expect(slugs(preview.report.errors)).toContain('signer_without_signature_field');
    expect(preview.report.ready).toBe(false);
    const send = await service.validateFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      stage: 'send',
    });
    expect(slugs(send.report.errors)).toContain('signer_without_signature_field');

    store.fields = [];
    store.writes = 0;
    const optional = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [signatureAt(72, 200, { required: false })],
    });
    expect(slugs(optional.report.warnings)).toContain('signer_without_signature_field');

    store.fields = [];
    const initials = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [
        {
          signer_id: SIGNER,
          kind: 'initials',
          box: box(1, 72, 200, 72, 40),
        },
      ],
    });
    expect(slugs(initials.report.warnings)).not.toContain('signer_without_signature_field');
    expect(initials.persisted).toBe(true);

    store.fields = [];
    const named = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [{ signer_id: SIGNER, kind: 'name', box: box(1, 72, 200, 180, 24) }],
    });
    expect(named.fields[0]?.kind).toBe('name');
    expect(store.fields[0]?.kind).toBe('text');
    expect(store.fields[0]?.link_id).toBe('name');
    expect(slugs(named.report.warnings)).toContain('signer_without_signature_field');

    const found = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      mode: 'replace',
      fields: [
        signatureAt(72, 200, { client_ref: 'sig' }),
        {
          signer_id: SIGNER,
          kind: 'signature',
          anchor: { text: 'anchortarget', match: 'case_insensitive' },
        },
      ],
    });
    expect(found.report.errors.find((issue) => issue.slug === 'anchor_not_found')).toBeUndefined();
    const exactMiss = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [
        {
          signer_id: SIGNER,
          kind: 'signature',
          anchor: { text: 'anchortarget', match: 'exact' },
        },
      ],
    });
    expect(slugs(exactMiss.report.errors)).toContain('anchor_not_found');

    const placed = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields: [signatureAt(72, 200, { client_ref: 'keep' })],
    });
    const firstId = placed.fields[0]?.id;
    expect(firstId).toEqual(expect.any(String));
    const beforeAppend = store.writes;
    const appended = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      mode: 'append',
      fields: [
        {
          signer_id: SIGNER,
          kind: 'date',
          client_ref: 'when',
          box: box(1, 72, 320, 110, 24),
        },
      ],
    });
    expect(appended.persisted).toBe(true);
    expect(appended.fields).toHaveLength(2);
    expect(appended.fields[0]?.id).not.toBe(firstId);
    expect(store.writes).toBe(beforeAppend + 1);

    const currentId = appended.fields[0]?.id;
    expect(currentId).toEqual(expect.any(String));
    if (!currentId) return;
    const moved = await service.updateFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      updates: [{ field_id: currentId, dx: 10 }],
    });
    expect(moved.persisted).toBe(true);
    expect(moved.fields[0]?.id).toBe(currentId);
    const shifted = (appended.fields[0]?.box.x ?? 0) + 10;
    expect(Math.abs((moved.fields[0]?.box.x ?? 0) - shifted)).toBeLessThanOrEqual(0.5);
    expect(store.updates).toBe(1);

    const storedX = store.fields.find((field) => field.id === currentId)?.x;
    const blocked = await service.updateFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      updates: [{ field_id: currentId, dx: 10_000 }],
    });
    expect(blocked.persisted).toBe(false);
    expect(slugs(blocked.report.errors)).toContain('field_out_of_bounds');
    expect(store.updates).toBe(1);
    expect(store.fields.find((field) => field.id === currentId)?.x).toBe(storedX);

    const dateId = moved.fields.find((field) => field.kind === 'date')?.id;
    expect(dateId).toEqual(expect.any(String));
    if (!dateId) return;
    const removed = await service.updateFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      updates: [{ field_id: dateId, dx: 4, box: box(1, 10, 10, 110, 24) }],
      remove: [dateId],
    });
    expect(removed.persisted).toBe(true);
    expect(removed.fields.map((field) => field.id)).toEqual([currentId]);

    await expectHttp(
      () =>
        service.updateFields({
          owner_id: OWNER,
          envelope_id: ENVELOPE,
          updates: [{ field_id: 'missing', dx: 1 }],
        }),
      NotFoundException,
      'field_not_found',
    );
    const updatesAfterMiss = store.updates;
    await expectHttp(
      () =>
        service.updateFields({
          owner_id: OWNER,
          envelope_id: ENVELOPE,
          updates: [],
          remove: ['missing'],
        }),
      NotFoundException,
      'field_not_found',
    );
    expect(store.updates).toBe(updatesAfterMiss);

    store.status = 'sent';
    await expectHttp(
      () =>
        service.placeFields({
          owner_id: OWNER,
          envelope_id: ENVELOPE,
          fields: [signatureAt(72, 200)],
        }),
      ConflictException,
      'envelope_not_draft',
    );
    store.path = null;
    store.status = 'draft';
    await expectHttp(
      () => service.inspectDocument({ owner_id: OWNER, envelope_id: ENVELOPE }),
      BadRequestException,
      'file_not_ready',
    );
  });

  it('round-trips every kind at its default size in points', async () => {
    const kinds: readonly PlacementKind[] = [
      'signature',
      'initials',
      'date',
      'text',
      'checkbox',
      'email',
      'name',
    ];
    const fields: PlacementFieldInput[] = kinds.map((kind, index) => ({
      signer_id: SIGNER,
      kind,
      client_ref: kind,
      box: box(1, 220, 40 + index * 70),
    }));
    const placed = await service.placeFields({
      owner_id: OWNER,
      envelope_id: ENVELOPE,
      fields,
    });
    expect(placed.report.errors).toEqual([]);
    expect(placed.persisted).toBe(true);
    for (const kind of kinds) {
      const field = placed.fields.find((item) => item.client_ref === kind);
      const size = DEFAULT_FIELD_SIZE_PT[kind];
      expect(field?.box.width).toBeCloseTo(size.width, 1);
      expect(field?.box.height).toBeCloseTo(size.height, 1);
      const backWidth = (field?.normalized.width ?? 0) * LETTER.width;
      const backHeight = (field?.normalized.height ?? 0) * LETTER.height;
      expect(Math.abs(backWidth - size.width)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(backHeight - size.height)).toBeLessThanOrEqual(0.5);
    }
    expect(store.fields.find((field) => field.link_id === 'name')?.kind).toBe('text');
  });
});
