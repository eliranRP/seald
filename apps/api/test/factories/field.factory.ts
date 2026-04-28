import { faker } from '@faker-js/faker';
import type { EnvelopeField } from '../../src/envelopes/envelope.entity';
import { SIGNER_DEFAULT_ID } from './signer.factory';

/**
 * Deterministic field factory (rule 11.1).
 *
 * Defaults emit a required signature field on page 1 — the cheapest
 * fixture for the burn-in / sealing tests. Override `kind` / `value_*` /
 * `link_id` etc. for specific scenarios.
 */
export const FIELD_DEFAULT_ID = '00000000-0000-0000-0000-00000000f001';

export interface MakeFieldOptions {
  readonly seed?: number;
}

export function makeField(
  overrides: Partial<EnvelopeField> = {},
  opts: MakeFieldOptions = {},
): EnvelopeField {
  if (opts.seed !== undefined) {
    faker.seed(opts.seed);
  }

  const base: EnvelopeField = {
    id: FIELD_DEFAULT_ID,
    signer_id: SIGNER_DEFAULT_ID,
    kind: 'signature',
    page: 1,
    x: 0.05,
    y: 0.05,
    width: 0.2,
    height: 0.05,
    required: true,
  };

  return { ...base, ...overrides };
}
