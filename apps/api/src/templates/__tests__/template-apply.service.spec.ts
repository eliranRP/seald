import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { Template, TemplateField } from 'shared';
import { ApplyTemplateDto } from '../dto/apply-template.dto';
import { TemplateApplyService } from '../template-apply.service';
import type { TemplatesRepository } from '../templates.repository';

const OWNER = '11111111-1111-4111-8111-111111111111';
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function template(
  field_layout: ReadonlyArray<TemplateField>,
  last_signers: Template['last_signers'] = [],
): Template {
  return {
    id: ID,
    owner_id: OWNER,
    title: 't',
    description: null,
    cover_color: null,
    field_layout,
    tags: [],
    last_signers,
    has_example_pdf: false,
    uses_count: 0,
    last_used_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function make(t: Template | null): TemplateApplyService {
  const repo = {
    findOneByOwner: jest.fn(async (owner: string, id: string) =>
      t && owner === t.owner_id && id === t.id ? t : null,
    ),
  } as unknown as TemplatesRepository;
  return new TemplateApplyService(repo);
}

const pagesOf = (out: { fields: ReadonlyArray<{ page: number }> }): number[] =>
  out.fields.map((f) => f.page);

describe('TemplateApplyService', () => {
  it("expands 'all' to every page and links the copies", async () => {
    const svc = make(template([{ type: 'initial', pageRule: 'all', x: 10, y: 20 }]));
    const out = await svc.apply(OWNER, ID, 3);
    expect(pagesOf(out)).toEqual([1, 2, 3]);
    expect(new Set(out.fields.map((f) => f.linkId)).size).toBe(1);
    expect(out.fields[0]?.linkId).toBeDefined();
    expect(out.total_pages).toBe(3);
  });

  it("expands 'allButLast', 'first', 'last' and a numeric page", async () => {
    const svc = make(
      template([
        { type: 'initial', pageRule: 'allButLast', x: 1, y: 1 },
        { type: 'signature', pageRule: 'first', x: 2, y: 2 },
        { type: 'date', pageRule: 'last', x: 3, y: 3 },
        { type: 'text', pageRule: 2, x: 4, y: 4 },
      ]),
    );
    const out = await svc.apply(OWNER, ID, 4);
    expect(out.fields.map((f) => [f.type, f.page])).toEqual([
      ['initial', 1],
      ['initial', 2],
      ['initial', 3],
      ['signature', 1],
      ['date', 4],
      ['text', 2],
    ]);
    expect(out.fields.filter((f) => f.type !== 'initial').every((f) => !f.linkId)).toBe(true);
  });

  it('drops a numeric rule beyond the document length', async () => {
    const svc = make(template([{ type: 'text', pageRule: 5, x: 0, y: 0 }]));
    expect((await svc.apply(OWNER, ID, 3)).fields).toEqual([]);
  });

  it('single-page document: allButLast is empty, first and last coincide', async () => {
    const svc = make(
      template([
        { type: 'initial', pageRule: 'allButLast', x: 0, y: 0 },
        { type: 'signature', pageRule: 'first', x: 0, y: 0 },
        { type: 'date', pageRule: 'last', x: 0, y: 0 },
      ]),
    );
    const out = await svc.apply(OWNER, ID, 1);
    expect(out.fields.map((f) => [f.type, f.page])).toEqual([
      ['signature', 1],
      ['date', 1],
    ]);
  });

  it('backfills signerRoleId from last_signers for legacy signerIndex layouts', async () => {
    const svc = make(
      template(
        [
          { type: 'signature', pageRule: 'last', x: 0, y: 0, signerIndex: 1 },
          { type: 'date', pageRule: 'last', x: 0, y: 0, signerIndex: 0, signerRoleId: 'kept' },
        ],
        [
          { id: 's0', name: 'A', email: 'a@x.io', color: '#000' },
          { id: 's1', name: 'B', email: 'b@x.io', color: '#111' },
        ],
      ),
    );
    const out = await svc.apply(OWNER, ID, 2);
    expect(out.fields[0]).toMatchObject({ signerIndex: 1, signerRoleId: 's1' });
    expect(out.fields[1]).toMatchObject({ signerIndex: 0, signerRoleId: 'kept' });
  });

  it('is owner scoped: another owner or unknown id is template_not_found', async () => {
    const svc = make(template([]));
    await expect(svc.apply('22222222-2222-4222-8222-222222222222', ID, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.apply(OWNER, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2)).rejects.toThrow(
      'template_not_found',
    );
  });
});

describe('ApplyTemplateDto', () => {
  const errs = async (totalPages: unknown): Promise<number> =>
    (await validate(plainToInstance(ApplyTemplateDto, { totalPages }))).length;

  it('accepts a positive integer page count', async () => {
    expect(await errs(1)).toBe(0);
    expect(await errs(2000)).toBe(0);
  });

  it('rejects zero, negatives, fractions, strings and oversized counts', async () => {
    for (const bad of [0, -1, 1.5, '3', 2001, undefined]) {
      expect(await errs(bad)).toBeGreaterThan(0);
    }
  });
});
