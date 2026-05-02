import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { AddSignerDto } from './add-signer.dto';
import { CreateEnvelopeDto } from './create-envelope.dto';
import { PatchEnvelopeDto } from './patch-envelope.dto';
import { FieldPlacementDto, PlaceFieldsDto } from './place-fields.dto';

/**
 * Direct DTO validation tests. Each DTO is exercised through the same
 * `plainToInstance` + `validateSync` pipeline that NestJS's `ValidationPipe`
 * uses, so the assertions cover the actual runtime behaviour the controller
 * sees — not a re-implementation.
 *
 * The HTTP-shaped end of the validation pipeline (status code mapping +
 * error envelope) is covered by the e2e specs; here we only assert the
 * field-level validator decisions.
 */

function pathsOf(errors: ValidationError[], prefix = ''): string[] {
  const out: string[] = [];
  for (const err of errors) {
    const path = prefix ? `${prefix}.${err.property}` : err.property;
    if (err.constraints && Object.keys(err.constraints).length > 0) out.push(path);
    if (err.children && err.children.length > 0) out.push(...pathsOf(err.children, path));
  }
  return out;
}

describe('CreateEnvelopeDto', () => {
  it('accepts a non-empty title within 200 chars', () => {
    const dto = plainToInstance(CreateEnvelopeDto, { title: 'Welcome packet' });
    expect(validateSync(dto)).toEqual([]);
  });

  it('accepts unicode title', () => {
    const dto = plainToInstance(CreateEnvelopeDto, { title: '契約書 — déjà vu 📝' });
    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects empty string title', () => {
    const dto = plainToInstance(CreateEnvelopeDto, { title: '' });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['title']);
  });

  it('rejects missing title', () => {
    const dto = plainToInstance(CreateEnvelopeDto, {});
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toContain('title');
  });

  it('rejects non-string title', () => {
    const dto = plainToInstance(CreateEnvelopeDto, { title: 42 });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toContain('title');
  });

  it('accepts title of exactly 200 chars', () => {
    const dto = plainToInstance(CreateEnvelopeDto, { title: 'x'.repeat(200) });
    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects title longer than 200 chars', () => {
    const dto = plainToInstance(CreateEnvelopeDto, { title: 'x'.repeat(201) });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['title']);
  });
});

describe('AddSignerDto', () => {
  it('accepts a valid v4 UUID', () => {
    const dto = plainToInstance(AddSignerDto, {
      contact_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects malformed UUID', () => {
    const dto = plainToInstance(AddSignerDto, { contact_id: 'not-a-uuid' });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['contact_id']);
  });

  it('rejects missing contact_id', () => {
    const dto = plainToInstance(AddSignerDto, {});
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toContain('contact_id');
  });
});

describe('PatchEnvelopeDto', () => {
  it('accepts an empty body (all fields optional at the DTO layer)', () => {
    // Empty patch is rejected at the *service* layer (validation_error), not
    // by class-validator — the DTO declares both fields optional.
    const dto = plainToInstance(PatchEnvelopeDto, {});
    expect(validateSync(dto)).toEqual([]);
  });

  it('accepts title-only patch', () => {
    const dto = plainToInstance(PatchEnvelopeDto, { title: 'Renamed' });
    expect(validateSync(dto)).toEqual([]);
  });

  it('accepts ISO-8601 expires_at', () => {
    const dto = plainToInstance(PatchEnvelopeDto, {
      expires_at: '2026-12-31T23:59:59.000Z',
    });
    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects empty title when provided', () => {
    const dto = plainToInstance(PatchEnvelopeDto, { title: '' });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['title']);
  });

  it('rejects non-ISO expires_at', () => {
    const dto = plainToInstance(PatchEnvelopeDto, { expires_at: 'tomorrow' });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['expires_at']);
  });

  it('rejects title longer than 200 chars', () => {
    const dto = plainToInstance(PatchEnvelopeDto, { title: 'a'.repeat(201) });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['title']);
  });
});

describe('FieldPlacementDto', () => {
  const valid = {
    signer_id: '22222222-2222-4222-8222-222222222222',
    kind: 'signature',
    page: 1,
    x: 0.1,
    y: 0.1,
  };

  it('accepts a minimal valid placement', () => {
    const dto = plainToInstance(FieldPlacementDto, valid);
    expect(validateSync(dto)).toEqual([]);
  });

  it('accepts a fully populated placement', () => {
    const dto = plainToInstance(FieldPlacementDto, {
      ...valid,
      width: 0.3,
      height: 0.05,
      required: false,
      link_id: 'fld-7',
    });
    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects unknown kind', () => {
    const dto = plainToInstance(FieldPlacementDto, { ...valid, kind: 'mystery' });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['kind']);
  });

  it('rejects out-of-range x', () => {
    const dto = plainToInstance(FieldPlacementDto, { ...valid, x: 1.5 });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['x']);
  });

  it('rejects out-of-range y', () => {
    const dto = plainToInstance(FieldPlacementDto, { ...valid, y: -0.1 });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['y']);
  });

  it('rejects non-positive page', () => {
    const dto = plainToInstance(FieldPlacementDto, { ...valid, page: 0 });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['page']);
  });

  it('rejects fractional page', () => {
    const dto = plainToInstance(FieldPlacementDto, { ...valid, page: 1.5 });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['page']);
  });

  it('rejects link_id longer than 100 chars', () => {
    const dto = plainToInstance(FieldPlacementDto, { ...valid, link_id: 'x'.repeat(101) });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['link_id']);
  });

  it('rejects width > 1', () => {
    const dto = plainToInstance(FieldPlacementDto, { ...valid, width: 1.01 });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toEqual(['width']);
  });
});

describe('PlaceFieldsDto', () => {
  it('accepts an empty fields array', () => {
    const dto = plainToInstance(PlaceFieldsDto, { fields: [] });
    expect(validateSync(dto)).toEqual([]);
  });

  it('accepts up to 500 placements', () => {
    const fields = Array.from({ length: 500 }, () => ({
      signer_id: '22222222-2222-4222-8222-222222222222',
      kind: 'signature',
      page: 1,
      x: 0.1,
      y: 0.1,
    }));
    const dto = plainToInstance(PlaceFieldsDto, { fields });
    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects more than 500 placements (ArrayMaxSize)', () => {
    const fields = Array.from({ length: 501 }, () => ({
      signer_id: '22222222-2222-4222-8222-222222222222',
      kind: 'signature',
      page: 1,
      x: 0.1,
      y: 0.1,
    }));
    const dto = plainToInstance(PlaceFieldsDto, { fields });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toContain('fields');
  });

  it('rejects non-array fields', () => {
    const dto = plainToInstance(PlaceFieldsDto, { fields: 'nope' });
    const errors = validateSync(dto);
    expect(pathsOf(errors)).toContain('fields');
  });

  it('surfaces nested errors at field-element paths', () => {
    const dto = plainToInstance(PlaceFieldsDto, {
      fields: [
        {
          signer_id: 'not-uuid',
          kind: 'mystery',
          page: 0,
          x: 9,
          y: -1,
        },
      ],
    });
    const errors = validateSync(dto);
    const paths = pathsOf(errors);
    // ValidateNested + Type produces nested children — confirm we see the
    // sub-paths so consumers can locate the offending element.
    expect(paths.some((p) => p.startsWith('fields.0.'))).toBe(true);
    expect(paths).toEqual(
      expect.arrayContaining([
        'fields.0.signer_id',
        'fields.0.kind',
        'fields.0.page',
        'fields.0.x',
        'fields.0.y',
      ]),
    );
  });
});
