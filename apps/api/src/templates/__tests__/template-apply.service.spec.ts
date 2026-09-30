import { ConflictException, NotFoundException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import type { Template, TemplateLastSigner } from 'shared';
import type { EnvelopeField } from '../../envelopes/envelope.entity';
import type { EnvelopesService } from '../../envelopes/envelopes.service';
import {
  TemplateApplyNotReadyError,
  TemplateApplyService,
  TemplateHasNoFieldsError,
  TemplateRoleUnmappedError,
} from '../template-apply.service';
import type { TemplatesService } from '../templates.service';

const OWNER = '00000000-0000-4000-8000-000000000001';
const TEMPLATE_ID = '00000000-0000-4000-8000-000000000002';
const ENVELOPE_ID = '00000000-0000-4000-8000-000000000003';

const LAST_SIGNERS: ReadonlyArray<TemplateLastSigner> = [
  { id: 'role-a', name: 'Ada', email: 'Ada@Example.com', color: '#112233' },
  { id: 'role-b', name: 'Bea', email: 'bea@example.com', color: '#445566' },
];

function template(overrides?: Partial<Template>): Template {
  return {
    id: TEMPLATE_ID,
    owner_id: OWNER,
    title: 'NDA',
    description: null,
    cover_color: null,
    field_layout: [
      { type: 'initial', pageRule: 'all', x: 400, y: 12.5, signerRoleId: 'role-b' },
      { type: 'signature', pageRule: 9, x: 10, y: 20, signerIndex: 0 },
    ],
    tags: [],
    last_signers: LAST_SIGNERS,
    has_example_pdf: false,
    uses_count: 3,
    last_used_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Displayed page 200×100. Grid height is 560 * 100/200 = 280. */
const PAGE = { width: 200, height: 100 };
const GRID_HEIGHT = 560 * (PAGE.height / PAGE.width);

let pdfBytes: Buffer;

beforeAll(async () => {
  const doc = await PDFDocument.create();
  doc.addPage([PAGE.width, PAGE.height]);
  doc.addPage([PAGE.width, PAGE.height]);
  pdfBytes = Buffer.from(await doc.save());
});

function makeService(): {
  svc: TemplateApplyService;
  get: jest.Mock;
  use: jest.Mock;
  getById: jest.Mock;
  replaceFields: jest.Mock;
  readOriginalPdf: jest.Mock;
  listApplySigners: jest.Mock;
} {
  const get = jest.fn(async () => template());
  const use = jest.fn(async () => template({ uses_count: 4 }));
  const getById = jest.fn(async () => ({
    original_pages: 2,
    signers: [
      { id: 'signer-a', email: 'ada@example.com' },
      { id: 'signer-b', email: 'bea@example.com' },
    ],
  }));
  const listApplySigners = jest.fn(async () => [
    { id: 'signer-a', contact_id: 'role-a' },
    { id: 'signer-b', contact_id: 'role-b' },
  ]);
  const replaceFields = jest.fn(
    async (_owner: string, _id: string, fields: readonly EnvelopeField[]) =>
      fields.map((field, index) => ({ ...field, id: `field-${index}` })),
  );
  const readOriginalPdf = jest.fn(async () => pdfBytes);
  const templates = { get, use } as unknown as TemplatesService;
  const envelopes = {
    getById,
    replaceFields,
    readOriginalPdf,
    listApplySigners,
  } as unknown as EnvelopesService;
  return {
    svc: new TemplateApplyService(templates, envelopes),
    get,
    use,
    getById,
    replaceFields,
    readOriginalPdf,
    listApplySigners,
  };
}

describe('TemplateApplyService', () => {
  it('expands the layout, assigns signers, then bumps use', async () => {
    const { svc, use, replaceFields } = makeService();
    const order: string[] = [];
    replaceFields.mockImplementation(
      async (_owner: string, _id: string, fields: readonly EnvelopeField[]) => {
        order.push('replace');
        return fields.map((field, index) => ({ ...field, id: `field-${index}` }));
      },
    );
    use.mockImplementation(async () => {
      order.push('use');
      return template({ uses_count: 4 });
    });

    const out = await svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID);

    expect(order).toEqual(['replace', 'use']);
    expect(out.template_id).toBe(TEMPLATE_ID);
    expect(out.uses_count).toBe(4);
    // pageRule "all" on 2 pages → role-b. Numeric page 9 is past the end.
    // 400 and 12.5 are 560-grid pixels on a 200×100 page (grid height 280).
    const placed = replaceFields.mock.calls[0]?.[2] as Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    expect(placed).toHaveLength(2);
    for (const field of placed) {
      expect(field.x).toBeCloseTo(400 / 560, 10);
      expect(field.y).toBeCloseTo(12.5 / GRID_HEIGHT, 10);
      expect(field.width).toBeCloseTo(80 / 560, 10);
      expect(field.height).toBeCloseTo(54 / GRID_HEIGHT, 10);
    }
    expect(replaceFields).toHaveBeenCalledWith(OWNER, ENVELOPE_ID, [
      {
        signer_id: 'signer-b',
        kind: 'initials',
        page: 1,
        x: placed[0]!.x,
        y: placed[0]!.y,
        width: placed[0]!.width,
        height: placed[0]!.height,
        link_id: 'tpl-link-1',
      },
      {
        signer_id: 'signer-b',
        kind: 'initials',
        page: 2,
        x: placed[1]!.x,
        y: placed[1]!.y,
        width: placed[1]!.width,
        height: placed[1]!.height,
        link_id: 'tpl-link-1',
      },
    ]);
    expect(out.fields).toHaveLength(2);
  });

  it('uses signerIndex when no role was stored and last_signers cannot backfill one', async () => {
    const { svc, get, replaceFields } = makeService();
    get.mockResolvedValue(
      template({
        last_signers: [],
        field_layout: [{ type: 'date', pageRule: 'first', x: 1, y: 2, signerIndex: 1 }],
      }),
    );
    await svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID);
    const placed = replaceFields.mock.calls[0]?.[2][0] as { x: number; y: number };
    expect(placed).toMatchObject({ signer_id: 'signer-b', kind: 'date' });
    expect(placed.x).toBeCloseTo(1 / 560, 10);
    expect(placed.y).toBeCloseTo(2 / GRID_HEIGHT, 10);
  });

  it('maps an email field and keeps coordVersion 2 fractions', async () => {
    const { svc, get, replaceFields } = makeService();
    get.mockResolvedValue(
      template({
        field_layout: [
          {
            type: 'email',
            pageRule: 'first',
            x: 0.25,
            y: 0.4,
            width: 0.3,
            height: 0.1,
            coordVersion: 2,
            signerRoleId: 'role-a',
          },
        ],
      }),
    );
    await svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID);
    expect(replaceFields.mock.calls[0]?.[2][0]).toMatchObject({
      signer_id: 'signer-a',
      kind: 'email',
      x: 0.25,
      y: 0.4,
      width: 0.3,
      height: 0.1,
    });
  });

  it('returns template_role_unmapped when a lined-up field has no signer', async () => {
    const { svc, get, replaceFields, use } = makeService();
    get.mockResolvedValue(
      template({
        field_layout: [{ type: 'text', pageRule: 'first', x: 10, y: 20 }],
      }),
    );
    await expect(svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID)).rejects.toBeInstanceOf(
      TemplateRoleUnmappedError,
    );
    expect(replaceFields).not.toHaveBeenCalled();
    expect(use).not.toHaveBeenCalled();
  });

  it('binds by contact id and drops a field whose signer was removed', async () => {
    const { svc, get, listApplySigners, replaceFields, use } = makeService();
    get.mockResolvedValue(
      template({
        last_signers: [
          ...LAST_SIGNERS,
          { id: 'role-c', name: 'Cam', email: 'cam@example.com', color: '#778899' },
        ],
        field_layout: [
          { type: 'signature', pageRule: 'first', x: 10, y: 20, signerRoleId: 'role-b' },
          { type: 'date', pageRule: 'first', x: 30, y: 40, signerRoleId: 'role-c' },
        ],
      }),
    );
    listApplySigners.mockResolvedValue([
      { id: 'signer-z', contact_id: 'someone-else' },
      { id: 'signer-b', contact_id: 'role-b' },
    ]);
    await svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID);
    const placed = replaceFields.mock.calls[0]?.[2] as Array<{ signer_id: string; kind: string }>;
    expect(placed).toEqual([expect.objectContaining({ signer_id: 'signer-b', kind: 'signature' })]);
    expect(use).toHaveBeenCalled();
  });

  it('does not count a use when every page is out of range', async () => {
    const { svc, get, replaceFields, use } = makeService();
    get.mockResolvedValue(
      template({
        field_layout: [{ type: 'signature', pageRule: 9, x: 10, y: 20, signerRoleId: 'role-a' }],
      }),
    );
    await expect(svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID)).rejects.toBeInstanceOf(
      TemplateApplyNotReadyError,
    );
    expect(replaceFields).not.toHaveBeenCalled();
    expect(use).not.toHaveBeenCalled();
  });

  it('does not bump use when the template has no layout', async () => {
    const { svc, get, use, getById, replaceFields } = makeService();
    get.mockResolvedValue(template({ field_layout: [] }));
    await expect(svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID)).rejects.toBeInstanceOf(
      TemplateHasNoFieldsError,
    );
    expect(getById).not.toHaveBeenCalled();
    expect(replaceFields).not.toHaveBeenCalled();
    expect(use).not.toHaveBeenCalled();
  });

  it('does not bump use when the draft has no pages or no signers', async () => {
    const noPages = makeService();
    noPages.getById.mockResolvedValue({
      original_pages: null,
      signers: [{ id: 's', email: 'a@b.co' }],
    });
    await expect(noPages.svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID)).rejects.toBeInstanceOf(
      TemplateApplyNotReadyError,
    );
    expect(noPages.use).not.toHaveBeenCalled();

    const noSigners = makeService();
    noSigners.getById.mockResolvedValue({ original_pages: 3, signers: [] });
    await expect(noSigners.svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID)).rejects.toBeInstanceOf(
      TemplateApplyNotReadyError,
    );
    expect(noSigners.replaceFields).not.toHaveBeenCalled();
    expect(noSigners.use).not.toHaveBeenCalled();
  });

  it('does not bump use when the original PDF cannot be read', async () => {
    const { svc, use, replaceFields, readOriginalPdf } = makeService();
    readOriginalPdf.mockRejectedValue(new ConflictException('file_not_ready'));
    await expect(svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(replaceFields).not.toHaveBeenCalled();
    expect(use).not.toHaveBeenCalled();
  });

  it('does not bump use when replaceFields fails', async () => {
    const { svc, use, replaceFields } = makeService();
    replaceFields.mockRejectedValue(new ConflictException('envelope_not_draft'));
    await expect(svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(use).not.toHaveBeenCalled();
  });

  it('still surfaces a missing template as the existing not-found error', async () => {
    const { svc, get, use } = makeService();
    get.mockRejectedValue(new NotFoundException('template_not_found'));
    await expect(svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(use).not.toHaveBeenCalled();
  });
});
