import 'reflect-metadata';
import { ValidationPipe, type BadRequestException } from '@nestjs/common';
import type { FeatureFlag } from 'shared';
import { MultiDocumentPlaceFieldsDto, PlaceFieldsDto } from '../../envelopes/dto/place-fields.dto';
import { FlaggedBodyPipe } from '../flagged-body.pipe';

function setFlag(flag: FeatureFlag, on: boolean | undefined): void {
  const host = globalThis as unknown as {
    __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>>;
  };
  const next = { ...host.__SEALD_FEATURE_OVERRIDES__ };
  if (on === undefined) delete next[flag];
  else next[flag] = on;
  host.__SEALD_FEATURE_OVERRIDES__ = next;
}

const FIELD = {
  signer_id: '6f1b2a3c-4d5e-4f60-8a7b-9c0d1e2f3a4b',
  kind: 'signature',
  page: 1,
  x: 0.1,
  y: 0.1,
};
const DOC = '7a2c3b4d-5e6f-4071-9b8c-0d1e2f3a4b5c';

async function errorOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return (err as BadRequestException).getResponse();
  }
  throw new Error('expected a rejection');
}

describe('FlaggedBodyPipe (WP-03 place-fields)', () => {
  const pipe = new FlaggedBodyPipe(
    'multiDocumentEnvelopes',
    MultiDocumentPlaceFieldsDto,
    PlaceFieldsDto,
  );
  // What main.ts's global pipe answered before WP-03 for the same body.
  const legacy = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  afterEach(() => setFlag('multiDocumentEnvelopes', undefined));

  it('flag off: rejects document_id with exactly the legacy error', async () => {
    setFlag('multiDocumentEnvelopes', false);
    const body = { fields: [{ ...FIELD, document_id: DOC }] };
    const ours = await errorOf(pipe.transform(body));
    const before = await errorOf(
      legacy.transform(body, { type: 'body', metatype: PlaceFieldsDto }),
    );
    expect(ours).toEqual(before);
    expect(JSON.stringify(ours)).toContain('fields.0.property document_id should not exist');
  });

  it('flag off: passes a legacy body through unchanged', async () => {
    setFlag('multiDocumentEnvelopes', false);
    const out = (await pipe.transform({ fields: [FIELD] })) as PlaceFieldsDto;
    expect(out).toBeInstanceOf(PlaceFieldsDto);
    expect(out.fields[0]).toMatchObject(FIELD);
  });

  it('flag on: accepts a document_id and still validates it', async () => {
    setFlag('multiDocumentEnvelopes', true);
    const out = (await pipe.transform({
      fields: [{ ...FIELD, document_id: DOC }],
    })) as MultiDocumentPlaceFieldsDto;
    expect(out.fields[0]?.document_id).toBe(DOC);
    const bad = await errorOf(pipe.transform({ fields: [{ ...FIELD, document_id: 'nope' }] }));
    expect(JSON.stringify(bad)).toContain('document_id must be a UUID');
  });
});
