import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeclineDto } from './decline.dto';
import { EsignDisclosureDto } from './esign-disclosure.dto';
import { FillFieldDto } from './fill-field.dto';
import { SignatureMetaDto } from './signature-meta.dto';
import { StartSessionDto } from './start-session.dto';

/**
 * DTO unit tests — drive class-validator + class-transformer directly so
 * each rule (length, regex, enum, type coercion) is exercised. These are
 * cheap (no Nest container) and complement the e2e tests in
 * `test/envelopes-signer.e2e-spec.ts` which cover the wired-up
 * ValidationPipe behavior.
 */

async function check<T extends object>(
  cls: { new (): T },
  payload: Record<string, unknown>,
): Promise<{ instance: T; errors: import('class-validator').ValidationError[] }> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { instance, errors };
}

describe('StartSessionDto', () => {
  it('accepts a valid envelope_id + 43-char URL-safe token', async () => {
    const { errors } = await check(StartSessionDto, {
      envelope_id: '11111111-1111-4111-8111-111111111111',
      token: 'A'.repeat(43),
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-UUID envelope_id', async () => {
    const { errors } = await check(StartSessionDto, {
      envelope_id: 'not-a-uuid',
      token: 'A'.repeat(43),
    });
    expect(errors.some((e) => e.property === 'envelope_id')).toBe(true);
  });

  it('rejects a token shorter than 43 chars', async () => {
    const { errors } = await check(StartSessionDto, {
      envelope_id: '11111111-1111-4111-8111-111111111111',
      token: 'A'.repeat(42),
    });
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });

  it('rejects a token longer than 43 chars', async () => {
    const { errors } = await check(StartSessionDto, {
      envelope_id: '11111111-1111-4111-8111-111111111111',
      token: 'A'.repeat(44),
    });
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });

  it('rejects a token with non-URL-safe characters', async () => {
    const { errors } = await check(StartSessionDto, {
      envelope_id: '11111111-1111-4111-8111-111111111111',
      token: 'A'.repeat(42) + '+',
    });
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });
});

describe('DeclineDto', () => {
  it('accepts no reason', async () => {
    const { errors } = await check(DeclineDto, {});
    expect(errors).toHaveLength(0);
  });

  it('accepts a reason within 500 chars', async () => {
    const { errors } = await check(DeclineDto, { reason: 'too risky' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a reason longer than 500 chars', async () => {
    const { errors } = await check(DeclineDto, { reason: 'x'.repeat(501) });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('rejects a non-string reason', async () => {
    const { errors } = await check(DeclineDto, { reason: 123 });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });
});

describe('EsignDisclosureDto', () => {
  it('accepts a well-formed version slug', async () => {
    const { errors } = await check(EsignDisclosureDto, {
      disclosure_version: 'esign_v0.1',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects empty version', async () => {
    const { errors } = await check(EsignDisclosureDto, { disclosure_version: '' });
    expect(errors).toHaveLength(1);
  });

  it('rejects version > 64 chars', async () => {
    const { errors } = await check(EsignDisclosureDto, {
      disclosure_version: 'a'.repeat(65),
    });
    expect(errors).toHaveLength(1);
  });

  it('rejects uppercase / unsupported chars', async () => {
    const { errors } = await check(EsignDisclosureDto, {
      disclosure_version: 'ESIGN-V0.1',
    });
    expect(errors).toHaveLength(1);
  });

  it('rejects missing version field', async () => {
    const { errors } = await check(EsignDisclosureDto, {});
    expect(errors).toHaveLength(1);
  });
});

describe('FillFieldDto', () => {
  it('accepts value_text', async () => {
    const { errors } = await check(FillFieldDto, { value_text: '2026-04-24' });
    expect(errors).toHaveLength(0);
  });

  it('accepts value_boolean', async () => {
    const { errors } = await check(FillFieldDto, { value_boolean: true });
    expect(errors).toHaveLength(0);
  });

  it('rejects value_text longer than 500 chars', async () => {
    const { errors } = await check(FillFieldDto, { value_text: 'x'.repeat(501) });
    expect(errors.some((e) => e.property === 'value_text')).toBe(true);
  });

  it('rejects when neither value is provided (validateif chains require one)', async () => {
    // With both fields undefined, both ValidateIf branches activate, so
    // class-validator demands a string for value_text and a boolean for
    // value_boolean → validation fails.
    const { errors } = await check(FillFieldDto, {});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects value_boolean of wrong type', async () => {
    const { errors } = await check(FillFieldDto, { value_boolean: 'yes' });
    expect(errors.some((e) => e.property === 'value_boolean')).toBe(true);
  });
});

describe('SignatureMetaDto', () => {
  it('accepts a minimal valid payload (just format)', async () => {
    const { errors } = await check(SignatureMetaDto, { format: 'drawn' });
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown format', async () => {
    const { errors } = await check(SignatureMetaDto, { format: 'magic' });
    expect(errors.some((e) => e.property === 'format')).toBe(true);
  });

  it("accepts kind='signature' and kind='initials'", async () => {
    for (const kind of ['signature', 'initials'] as const) {
      const { errors } = await check(SignatureMetaDto, { format: 'drawn', kind });
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects unknown kind', async () => {
    const { errors } = await check(SignatureMetaDto, { format: 'drawn', kind: 'witness' });
    expect(errors.some((e) => e.property === 'kind')).toBe(true);
  });

  it('coerces stroke_count from a string (multipart fields are strings)', async () => {
    const { instance, errors } = await check(SignatureMetaDto, {
      format: 'drawn',
      stroke_count: '42',
    });
    expect(errors).toHaveLength(0);
    expect(instance.stroke_count).toBe(42);
  });

  it('rejects negative stroke_count', async () => {
    const { errors } = await check(SignatureMetaDto, {
      format: 'drawn',
      stroke_count: '-1',
    });
    expect(errors.some((e) => e.property === 'stroke_count')).toBe(true);
  });

  it('rejects stroke_count above 10_000', async () => {
    const { errors } = await check(SignatureMetaDto, {
      format: 'drawn',
      stroke_count: '10001',
    });
    expect(errors.some((e) => e.property === 'stroke_count')).toBe(true);
  });

  it('rejects font longer than 64 chars', async () => {
    const { errors } = await check(SignatureMetaDto, {
      format: 'drawn',
      font: 'x'.repeat(65),
    });
    expect(errors.some((e) => e.property === 'font')).toBe(true);
  });

  it('rejects source_filename longer than 255 chars', async () => {
    const { errors } = await check(SignatureMetaDto, {
      format: 'drawn',
      source_filename: 'x'.repeat(256),
    });
    expect(errors.some((e) => e.property === 'source_filename')).toBe(true);
  });
});
