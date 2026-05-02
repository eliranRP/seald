// reflect-metadata must be loaded before any class-validator / class-transformer
// import touches the DTO decorators — the standalone spec doesn't go through
// AppModule so we polyfill it here. (Nest's @nestjs/core entrypoint normally
// imports this for us when the spec spins up a TestingModule.)
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTemplateDto, TemplateFieldDto, TemplateLastSignerDto } from './create-template.dto';
import { UpdateTemplateDto } from './update-template.dto';

const VALID_FIELD = {
  type: 'signature',
  pageRule: 'last',
  x: 60,
  y: 540,
};

function propsWithErrors(errors: { property: string; children?: unknown[] }[]): string[] {
  return errors.map((e) => e.property);
}

describe('CreateTemplateDto', () => {
  it('accepts a minimal valid payload', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 'NDA',
      field_layout: [VALID_FIELD],
    });
    const errs = await validate(dto);
    expect(errs).toEqual([]);
  });

  it('accepts every literal pageRule value (all / allButLast / first / last)', async () => {
    for (const pr of ['all', 'allButLast', 'first', 'last']) {
      const dto = plainToInstance(CreateTemplateDto, {
        title: 't',
        field_layout: [{ ...VALID_FIELD, pageRule: pr }],
      });
      const errs = await validate(dto);
      expect(errs).toEqual([]);
    }
  });

  it('accepts an integer pageRule (1-indexed page number)', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [{ ...VALID_FIELD, pageRule: 5 }],
    });
    const errs = await validate(dto);
    expect(errs).toEqual([]);
  });

  it('rejects pageRule = 0 (not a positive integer)', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [{ ...VALID_FIELD, pageRule: 0 }],
    });
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a negative integer pageRule', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [{ ...VALID_FIELD, pageRule: -1 }],
    });
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a non-integer pageRule (1.5)', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [{ ...VALID_FIELD, pageRule: 1.5 }],
    });
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects an unknown pageRule literal ("middle")', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [{ ...VALID_FIELD, pageRule: 'middle' }],
    });
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects an unknown field type', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [{ ...VALID_FIELD, type: 'frob' }],
    });
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects empty title (MinLength 1)', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: '',
      field_layout: [VALID_FIELD],
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('title');
  });

  it('rejects an over-long title (>200 chars)', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 'x'.repeat(201),
      field_layout: [VALID_FIELD],
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('title');
  });

  it('rejects a non-string title', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 12345,
      field_layout: [VALID_FIELD],
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('title');
  });

  it('rejects an over-long description (>2000 chars)', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      description: 'x'.repeat(2001),
      field_layout: [VALID_FIELD],
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('description');
  });

  it('rejects an invalid cover_color (not a #RRGGBB hex)', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      cover_color: 'red',
      field_layout: [VALID_FIELD],
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('cover_color');
  });

  it('accepts a valid #RRGGBB cover_color', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      cover_color: '#A1B2C3',
      field_layout: [VALID_FIELD],
    });
    const errs = await validate(dto);
    expect(errs).toEqual([]);
  });

  it('caps field_layout at 200 entries', async () => {
    const big = Array.from({ length: 201 }, () => ({ ...VALID_FIELD }));
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: big,
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('field_layout');
  });

  it('caps tags at 32 entries', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [VALID_FIELD],
      tags: Array.from({ length: 33 }, (_, i) => `tag${i}`),
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('tags');
  });

  it('caps individual tag length at 48 chars', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [VALID_FIELD],
      tags: ['x'.repeat(49)],
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('tags');
  });

  it('caps last_signers at 50 entries', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [VALID_FIELD],
      last_signers: Array.from({ length: 51 }, (_, i) => ({
        id: `c-${i}`,
        name: 'A',
        email: `a${i}@x.com`,
        color: '#000000',
      })),
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('last_signers');
  });

  it('rejects last_signer with bad email', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [VALID_FIELD],
      last_signers: [{ id: 'c-1', name: 'Ada', email: 'not-an-email', color: '#000000' }],
    });
    const errs = await validate(dto);
    // The error nests under last_signers[0].email; presence of any error
    // on `last_signers` is enough.
    expect(propsWithErrors(errs)).toContain('last_signers');
  });

  it('rejects last_signer with bad color hex', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [VALID_FIELD],
      last_signers: [{ id: 'c-1', name: 'Ada', email: 'ada@x.com', color: 'red' }],
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('last_signers');
  });

  it('rejects field with non-numeric x/y', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [{ ...VALID_FIELD, x: 'left' }],
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('field_layout');
  });

  it('rejects an over-long field label (>100 chars)', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [{ ...VALID_FIELD, label: 'x'.repeat(101) }],
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('field_layout');
  });

  it('rejects negative signerIndex', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [{ ...VALID_FIELD, signerIndex: -1 }],
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('field_layout');
  });

  it('rejects non-integer signerIndex', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [{ ...VALID_FIELD, signerIndex: 1.5 }],
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('field_layout');
  });

  it('preserves a unicode title verbatim through plainToInstance', () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 'NDA — שלום 🌍',
      field_layout: [VALID_FIELD],
    });
    expect(dto.title).toBe('NDA — שלום 🌍');
  });

  it('custom IsPageRule decorator surfaces a useful default message', async () => {
    const dto = plainToInstance(CreateTemplateDto, {
      title: 't',
      field_layout: [{ ...VALID_FIELD, pageRule: 'middle' }],
    });
    const errs = await validate(dto);
    // Drill into the nested validation error to assert the custom
    // decorator's default message contains the literal list. This
    // exercises the `defaultMessage` branch of IsPageRule.
    const flat = JSON.stringify(errs);
    expect(flat).toMatch(/all, allButLast, first, last/);
  });
});

describe('UpdateTemplateDto', () => {
  it('accepts an empty object (every field optional)', async () => {
    const dto = plainToInstance(UpdateTemplateDto, {});
    const errs = await validate(dto);
    expect(errs).toEqual([]);
  });

  it('validates individual fields when present (bad title)', async () => {
    const dto = plainToInstance(UpdateTemplateDto, { title: '' });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('title');
  });

  it('caps field_layout at 200 entries', async () => {
    const dto = plainToInstance(UpdateTemplateDto, {
      field_layout: Array.from({ length: 201 }, () => ({ ...VALID_FIELD })),
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('field_layout');
  });

  it('rejects bad cover_color when present, accepts when absent', async () => {
    const bad = await validate(plainToInstance(UpdateTemplateDto, { cover_color: 'red' }));
    expect(propsWithErrors(bad)).toContain('cover_color');
    const good = await validate(plainToInstance(UpdateTemplateDto, { cover_color: '#FFFFFF' }));
    expect(good).toEqual([]);
  });

  it('rejects oversized tags array', async () => {
    const dto = plainToInstance(UpdateTemplateDto, {
      tags: Array.from({ length: 33 }, (_, i) => `tag${i}`),
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('tags');
  });
});

describe('TemplateFieldDto / TemplateLastSignerDto direct use', () => {
  // These DTOs are also exported standalone (e.g. by the SPA shared
  // types via class metadata). Validate them directly for completeness.
  it('TemplateFieldDto rejects a missing type', async () => {
    const dto = plainToInstance(TemplateFieldDto, { pageRule: 'all', x: 0, y: 0 });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('type');
  });

  it('TemplateLastSignerDto rejects an over-long name (>120)', async () => {
    const dto = plainToInstance(TemplateLastSignerDto, {
      id: 'c-1',
      name: 'x'.repeat(121),
      email: 'a@b.c',
      color: '#000000',
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('name');
  });

  it('TemplateLastSignerDto rejects an empty id', async () => {
    const dto = plainToInstance(TemplateLastSignerDto, {
      id: '',
      name: 'A',
      email: 'a@b.c',
      color: '#000000',
    });
    const errs = await validate(dto);
    expect(propsWithErrors(errs)).toContain('id');
  });
});
