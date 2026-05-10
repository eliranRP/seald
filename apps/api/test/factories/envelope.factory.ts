import { faker } from '@faker-js/faker';
import type { Envelope } from '../../src/envelopes/envelope.entity';

/**
 * Deterministic envelope factory used by unit + e2e specs (rule 11.1).
 *
 * Defaults match the literals already baked into `sealing.service.spec.ts`,
 * `envelopes.service.spec.ts`, and `signing.service.spec.ts` so the
 * refactored specs are byte-equivalent to their hand-rolled versions.
 *
 * Override individual fields by passing a partial; the spread happens
 * AFTER the deterministic defaults so any override always wins.
 *
 * The `seed` arg is forwarded to `@faker-js/faker` (rule 11.4) so
 * downstream factories that pull random emails / names can stay
 * deterministic per-test. Defaults to 42.
 */
export const ENVELOPE_DEFAULT_ID = '00000000-0000-0000-0000-000000000001';
export const ENVELOPE_DEFAULT_OWNER_ID = '00000000-0000-0000-0000-000000000099';
export const ENVELOPE_DEFAULT_SHORT_CODE = 'SC0000000001';

export interface MakeEnvelopeOptions {
  readonly seed?: number;
}

export function makeEnvelope(
  overrides: Partial<Envelope> = {},
  opts: MakeEnvelopeOptions = {},
): Envelope {
  // Optional faker seed — kept lazy so tests that don't import faker pay
  // no cost. The seed call is idempotent.
  if (opts.seed !== undefined) {
    faker.seed(opts.seed);
  }

  const now = '2026-04-25T10:00:00.000Z';
  const expiry = '2026-05-25T10:00:00.000Z';

  const base: Envelope = {
    id: ENVELOPE_DEFAULT_ID,
    owner_id: ENVELOPE_DEFAULT_OWNER_ID,
    title: 'Spec Envelope',
    short_code: ENVELOPE_DEFAULT_SHORT_CODE,
    status: 'draft',
    delivery_mode: 'parallel',
    original_pages: 1,
    original_sha256: null,
    sealed_sha256: null,
    sender_email: 'sender@example.com',
    sender_name: 'Sender',
    sent_at: now,
    completed_at: null,
    expires_at: expiry,
    tc_version: 'tc-v1',
    privacy_version: 'pp-v1',
    signers: [],
    fields: [],
    tags: [],
    created_at: now,
    updated_at: now,
  };

  return { ...base, ...overrides };
}
