import { faker } from '@faker-js/faker';
import type { EnvelopeEvent } from '../../src/envelopes/envelope.entity';
import { ENVELOPE_DEFAULT_ID } from './envelope.factory';
import { SIGNER_DEFAULT_ID } from './signer.factory';

/**
 * Deterministic envelope-event factory (rule 11.1).
 */
export const EVENT_DEFAULT_ID = '00000000-0000-0000-0000-00000000e001';

export interface MakeEventOptions {
  readonly seed?: number;
}

export function makeEvent(
  overrides: Partial<EnvelopeEvent> = {},
  opts: MakeEventOptions = {},
): EnvelopeEvent {
  if (opts.seed !== undefined) {
    faker.seed(opts.seed);
  }

  const now = '2026-04-25T10:00:00.000Z';

  const base: EnvelopeEvent = {
    id: EVENT_DEFAULT_ID,
    envelope_id: ENVELOPE_DEFAULT_ID,
    signer_id: SIGNER_DEFAULT_ID,
    actor_kind: 'system',
    event_type: 'sent',
    ip: null,
    user_agent: null,
    metadata: {},
    created_at: now,
  };

  return { ...base, ...overrides };
}
