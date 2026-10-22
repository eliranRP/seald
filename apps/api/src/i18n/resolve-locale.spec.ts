import 'reflect-metadata';
import { ValidationPipe, type BadRequestException } from '@nestjs/common';
import type { FeatureFlag } from 'shared';
import { AddSignerDto } from '../envelopes/dto/add-signer.dto';
import { CreateEnvelopeDto } from '../envelopes/dto/create-envelope.dto';
import { PatchEnvelopeDto } from '../envelopes/dto/patch-envelope.dto';
import { resolveContentLocale } from './resolve-locale';

function setFlag(flag: FeatureFlag, on: boolean | undefined): void {
  const host = globalThis as unknown as {
    __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>>;
  };
  const next = { ...host.__SEALD_FEATURE_OVERRIDES__ };
  if (on === undefined) delete next[flag];
  else next[flag] = on;
  host.__SEALD_FEATURE_OVERRIDES__ = next;
}

afterEach(() => setFlag('i18n', undefined));

describe('resolveContentLocale', () => {
  it('flag off: always en', () => {
    setFlag('i18n', false);
    expect(resolveContentLocale({ signerLocale: 'en', envelopeLocale: 'en' })).toBe('en');
  });

  it('flag on: signer, then envelope, then en', () => {
    setFlag('i18n', true);
    expect(resolveContentLocale({ signerLocale: 'en', envelopeLocale: null })).toBe('en');
    expect(resolveContentLocale({ envelopeLocale: 'en' })).toBe('en');
    expect(resolveContentLocale({})).toBe('en');
  });

  it('flag on: an unsupported stored value falls back to en', () => {
    setFlag('i18n', true);
    expect(resolveContentLocale({ signerLocale: 'xx', envelopeLocale: 'yy' })).toBe('en');
  });
});

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

describe('locale on the envelope and signer DTOs', () => {
  const dtos: ReadonlyArray<readonly [string, new () => object, Record<string, unknown>]> = [
    ['create', CreateEnvelopeDto, { title: 'T' }],
    ['patch', PatchEnvelopeDto, { title: 'T' }],
    ['add signer', AddSignerDto, { email: 'a@example.com', name: 'A' }],
  ];

  it.each(dtos)('%s, flag off: locale fails like an unknown property', async (_n, dto, base) => {
    setFlag('i18n', false);
    const ours = await errorOf({ ...base, locale: 'en' }, dto);
    const unknown = await errorOf({ ...base, bogus: 'en' }, dto);
    expect(JSON.stringify(ours)).toBe(JSON.stringify(unknown).replace('bogus', 'locale'));
  });

  it.each(dtos)('%s, flag on: en passes, others fail', async (_n, dto, base) => {
    setFlag('i18n', true);
    expect(await errorOf({ ...base, locale: 'en' }, dto)).toBeNull();
    expect(await errorOf({ ...base, locale: 'xx' }, dto)).toEqual({
      message: ['locale must be one of the following values: en'],
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it.each(dtos)('%s: omitting locale is fine either way', async (_n, dto, base) => {
    setFlag('i18n', false);
    expect(await errorOf(base, dto)).toBeNull();
    setFlag('i18n', true);
    expect(await errorOf(base, dto)).toBeNull();
  });
});
