import { faker } from '@faker-js/faker';
import type { EnvelopeSigner } from '../../src/envelopes/envelope.entity';

/**
 * Deterministic signer factory (rule 11.1).
 *
 * Defaults match the literals already baked into the three target specs
 * (`sealing.service.spec.ts`, `signing.service.spec.ts`,
 * `envelopes.service.spec.ts`).
 */
export const SIGNER_DEFAULT_ID = '00000000-0000-0000-0000-0000000000aa';

export interface MakeSignerOptions {
  readonly seed?: number;
}

export function makeSigner(
  overrides: Partial<EnvelopeSigner> = {},
  opts: MakeSignerOptions = {},
): EnvelopeSigner {
  if (opts.seed !== undefined) {
    faker.seed(opts.seed);
  }

  const now = '2026-04-25T10:00:00.000Z';

  const base: EnvelopeSigner = {
    id: SIGNER_DEFAULT_ID,
    email: 'ada@example.com',
    name: 'Ada',
    color: '#112233',
    role: 'signatory',
    signing_order: 1,
    status: 'viewing',
    viewed_at: now,
    tc_accepted_at: now,
    signed_at: null,
    declined_at: null,
  };

  return { ...base, ...overrides };
}
