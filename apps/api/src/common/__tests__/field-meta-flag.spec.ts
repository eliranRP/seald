import 'reflect-metadata';
import { ValidationPipe, type BadRequestException } from '@nestjs/common';
import type { FeatureFlag } from 'shared';
import { PatchEnvelopeDto } from '../../envelopes/dto/patch-envelope.dto';
import { PlaceFieldsDto } from '../../envelopes/dto/place-fields.dto';
import {
  assertNoMetaV2,
  normalizeFieldPlacements,
  validatePlacementMeta,
} from '../../envelopes/field-placement.service';
import { CreateTemplateDto } from '../../templates/dto/create-template.dto';
import { validateTemplateMeta } from '../../templates/template-meta';

function setFlag(flag: FeatureFlag, on: boolean | undefined): void {
  const host = globalThis as unknown as {
    __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>>;
  };
  const next = { ...host.__SEALD_FEATURE_OVERRIDES__ };
  if (on === undefined) delete next[flag];
  else next[flag] = on;
  host.__SEALD_FEATURE_OVERRIDES__ = next;
}

// The options main.ts gives the global ValidationPipe.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

async function errorOf(body: unknown, metatype: new () => object): Promise<unknown> {
  try {
    await pipe.transform(body, { type: 'body', metatype });
  } catch (err) {
    return (err as BadRequestException).getResponse();
  }
  return null;
}

const SIGNER = '6f1b2a3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const base = { signer_id: SIGNER, page: 1, x: 0.1, y: 0.1 };
const OPTIONS = [
  { label: 'Small', value: 's' },
  { label: 'Large', value: 'l' },
];

afterEach(() => setFlag('fieldMetaV2', undefined));

describe('place-fields DTO and fieldMetaV2', () => {
  it('flag off: a new kind fails with the legacy isIn message', async () => {
    setFlag('fieldMetaV2', false);
    expect(await errorOf({ fields: [{ ...base, kind: 'radio' }] }, PlaceFieldsDto)).toEqual({
      message: [
        'fields.0.kind must be one of the following values: signature, initials, date, text, checkbox, email',
      ],
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('flag off: meta fails exactly like an unknown property', async () => {
    setFlag('fieldMetaV2', false);
    const ours = await errorOf({ fields: [{ ...base, kind: 'text', meta: {} }] }, PlaceFieldsDto);
    const unknown = await errorOf(
      { fields: [{ ...base, kind: 'text', bogus: {} }] },
      PlaceFieldsDto,
    );
    expect(JSON.stringify(ours)).toBe(JSON.stringify(unknown).replace('bogus', 'meta'));
  });

  it('flag off: legacy kinds without meta still pass', async () => {
    setFlag('fieldMetaV2', false);
    expect(await errorOf({ fields: [{ ...base, kind: 'email' }] }, PlaceFieldsDto)).toBeNull();
  });

  it('flag on: new kinds and meta pass the DTO', async () => {
    setFlag('fieldMetaV2', true);
    const body = {
      fields: [
        { ...base, kind: 'radio', meta: { options: OPTIONS } },
        { ...base, kind: 'name' },
        { ...base, kind: 'number', meta: { min: 1 } },
      ],
    };
    expect(await errorOf(body, PlaceFieldsDto)).toBeNull();
  });

  it('flag on: meta must be an object, an unknown kind is still refused', async () => {
    setFlag('fieldMetaV2', true);
    expect(
      JSON.stringify(
        await errorOf({ fields: [{ ...base, kind: 'text', meta: 'x' }] }, PlaceFieldsDto),
      ),
    ).toContain('meta must be an object');
    expect(
      JSON.stringify(
        await errorOf({ fields: [{ ...base, kind: 'text', meta: null }] }, PlaceFieldsDto),
      ),
    ).toContain('meta must be an object');
    expect(
      JSON.stringify(await errorOf({ fields: [{ ...base, kind: 'hologram' }] }, PlaceFieldsDto)),
    ).toContain('name, number, radio, dropdown');
  });
});

describe('patch-envelope DTO and fieldMetaV2', () => {
  it('flag off: date_format and timezone are unknown properties', async () => {
    setFlag('fieldMetaV2', false);
    const err = await errorOf(
      { date_format: 'yyyy-MM-dd', timezone: 'Europe/Berlin' },
      PatchEnvelopeDto,
    );
    expect(err).toEqual({
      message: ['property date_format should not exist', 'property timezone should not exist'],
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('flag on: validates both', async () => {
    setFlag('fieldMetaV2', true);
    expect(
      await errorOf({ date_format: 'dd.MM.yyyy', timezone: 'Europe/Berlin' }, PatchEnvelopeDto),
    ).toBeNull();
    const bad = JSON.stringify(
      await errorOf({ date_format: 'YYYY', timezone: 'Mars/Olympus' }, PatchEnvelopeDto),
    );
    expect(bad).toContain('date_format must be one of the following values');
    expect(bad).toContain('timezone must be an IANA timezone');
  });
});

describe('template DTO and fieldMetaV2', () => {
  const tpl = (type: string, extra: Record<string, unknown> = {}): unknown => ({
    title: 'T',
    field_layout: [{ type, pageRule: 'first', x: 1, y: 2, ...extra }],
  });

  it('flag off: new types and meta are refused with the legacy messages', async () => {
    setFlag('fieldMetaV2', false);
    expect(JSON.stringify(await errorOf(tpl('radio'), CreateTemplateDto))).toContain(
      'type must be one of the following values: signature, initial, date, text, checkbox',
    );
    expect(JSON.stringify(await errorOf(tpl('text', { meta: {} }), CreateTemplateDto))).toContain(
      'property meta should not exist',
    );
    expect(await errorOf(tpl('text'), CreateTemplateDto)).toBeNull();
  });

  it('flag on: accepted', async () => {
    setFlag('fieldMetaV2', true);
    expect(
      await errorOf(tpl('dropdown', { meta: { options: OPTIONS } }), CreateTemplateDto),
    ).toBeNull();
  });
});

describe('validatePlacementMeta', () => {
  const f = (kind: 'radio' | 'text' | 'number', meta?: Record<string, unknown>) => ({
    ...base,
    kind,
    ...(meta ? { meta } : {}),
  });

  it('stores {} for fields without meta and passes parsed meta through', () => {
    const out = validatePlacementMeta([f('text'), f('radio', { options: OPTIONS, default: 's' })]);
    expect(out.map((x) => x.meta)).toEqual([{}, { options: OPTIONS, default: 's' }]);
  });

  it('lists every problem with its field index', () => {
    let message: unknown;
    try {
      validatePlacementMeta([f('radio'), f('text'), f('number', { min: 9, max: 1 })]);
    } catch (err) {
      message = (err as BadRequestException).getResponse();
    }
    const text = JSON.stringify(message);
    expect(text).toContain('fields.0.meta.options');
    expect(text).toContain('fields.2.meta.min: min must not exceed max');
    expect(text).not.toContain('fields.1.');
  });
});

describe('normalizeFieldPlacements and meta.required', () => {
  it('explicit required wins; otherwise meta.required; otherwise true', () => {
    const [a, b, c, d] = normalizeFieldPlacements([
      { ...base, kind: 'text', required: true, meta: { required: false } },
      { ...base, kind: 'text', meta: { required: false } },
      { ...base, kind: 'text' },
      { ...base, kind: 'text', required: false },
    ]);
    expect([a?.required, b?.required, c?.required, d?.required]).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it('carries meta only when present', () => {
    const [a, b] = normalizeFieldPlacements([
      { ...base, kind: 'text', meta: { label: 'L' } },
      { ...base, kind: 'text' },
    ]);
    expect(a?.meta).toEqual({ label: 'L' });
    expect(b).not.toHaveProperty('meta');
  });
});

describe('assertNoMetaV2', () => {
  it('refuses new kinds and meta, allows legacy fields', () => {
    expect(() => assertNoMetaV2([{ kind: 'text' }])).not.toThrow();
    expect(() => assertNoMetaV2([{ kind: 'name' }])).toThrow();
    expect(() => assertNoMetaV2([{ kind: 'text', meta: {} }])).toThrow();
  });
});

describe('validateTemplateMeta', () => {
  it('maps initial to initials, leaves metaless entries alone, requires radio options', () => {
    const layout = [
      { type: 'initial' as const, pageRule: 'all' as const, x: 1, y: 1 },
      { type: 'text' as const, pageRule: 'first' as const, x: 1, y: 1, meta: { char_limit: 10 } },
    ];
    expect(validateTemplateMeta(layout)).toEqual(layout);
    expect(() =>
      validateTemplateMeta([{ type: 'radio' as const, pageRule: 'first' as const, x: 1, y: 1 }]),
    ).toThrow();
    expect(() =>
      validateTemplateMeta([
        { type: 'text' as const, pageRule: 'first' as const, x: 1, y: 1, meta: { min: 1 } },
      ]),
    ).toThrow();
  });
});
