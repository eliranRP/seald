import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Template, TemplateLastSigner } from 'shared';
import type { EnvelopeField } from '../../envelopes/envelope.entity';
import type { EnvelopesService } from '../../envelopes/envelopes.service';
import {
  TemplateApplyNotReadyError,
  TemplateApplyService,
  TemplateHasNoFieldsError,
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

function makeService(): {
  svc: TemplateApplyService;
  get: jest.Mock;
  use: jest.Mock;
  getById: jest.Mock;
  replaceFields: jest.Mock;
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
  const replaceFields = jest.fn(
    async (_owner: string, _id: string, fields: readonly EnvelopeField[]) =>
      fields.map((field, index) => ({ ...field, id: `field-${index}` })),
  );
  const templates = { get, use } as unknown as TemplatesService;
  const envelopes = { getById, replaceFields } as unknown as EnvelopesService;
  return { svc: new TemplateApplyService(templates, envelopes), get, use, getById, replaceFields };
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
    expect(replaceFields).toHaveBeenCalledWith(OWNER, ENVELOPE_ID, [
      {
        signer_id: 'signer-b',
        kind: 'initials',
        page: 1,
        x: 400,
        y: 12.5,
        width: null,
        height: null,
        required: true,
        link_id: 'tpl-link-1',
      },
      {
        signer_id: 'signer-b',
        kind: 'initials',
        page: 2,
        x: 400,
        y: 12.5,
        width: null,
        height: null,
        required: true,
        link_id: 'tpl-link-1',
      },
    ]);
    expect(out.fields).toHaveLength(2);
  });

  it('uses signerIndex when emails line up and no role id is stored', async () => {
    const { svc, get, replaceFields } = makeService();
    get.mockResolvedValue(
      template({
        field_layout: [{ type: 'date', pageRule: 'first', x: 1, y: 2, signerIndex: 1 }],
      }),
    );
    await svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID);
    expect(replaceFields.mock.calls[0]?.[2][0]).toMatchObject({
      signer_id: 'signer-b',
      kind: 'date',
      x: 1,
      y: 2,
    });
  });

  it('assigns every field to the first signer when emails do not line up', async () => {
    const { svc, getById, replaceFields } = makeService();
    getById.mockResolvedValue({
      original_pages: 1,
      signers: [{ id: 'signer-z', email: 'someone-else@example.com' }],
    });
    await svc.apply(OWNER, TEMPLATE_ID, ENVELOPE_ID);
    const placed = replaceFields.mock.calls[0]?.[2] as Array<{ signer_id: string }>;
    expect(placed.every((field) => field.signer_id === 'signer-z')).toBe(true);
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
