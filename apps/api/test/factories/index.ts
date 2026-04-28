/**
 * Barrel for test data factories (rule 11.1 + 11.4).
 *
 * Usage:
 *   import { makeEnvelope, makeSigner, makeField, makeEvent } from '../../test/factories';
 *
 * All four factories accept a `Partial<T>` override + an optional `{ seed }`
 * for deterministic faker reseeding (default 42).
 */
export {
  makeEnvelope,
  ENVELOPE_DEFAULT_ID,
  ENVELOPE_DEFAULT_OWNER_ID,
  ENVELOPE_DEFAULT_SHORT_CODE,
} from './envelope.factory';
export { makeSigner, SIGNER_DEFAULT_ID } from './signer.factory';
export { makeField, FIELD_DEFAULT_ID } from './field.factory';
export { makeEvent, EVENT_DEFAULT_ID } from './event.factory';
