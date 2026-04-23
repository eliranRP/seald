import type { z } from 'zod';
import type { EnvelopeSchema, SignerSchema, FieldSchema, EnvelopeEventSchema } from 'shared';

/**
 * Pure domain shapes of the envelope aggregate as exposed by the repository
 * and consumed by the HTTP / service layers. These derive from the zod
 * schemas in `shared/src/envelope-contract.ts` (the wire contract) so the
 * backend cannot accidentally leak internal fields — the schemas deliberately
 * omit token hashes, IPs, user-agents, and signature image paths.
 *
 * Timestamps are ISO strings. Adapters convert from DB-native `Date` at the
 * boundary inside `toEnvelopeDomain` / `toSignerDomain` / `toFieldDomain` /
 * `toEventDomain`.
 *
 * Note: `Signer` and `FieldKind` are not re-exported from the `'shared'`
 * barrel because Phase 1 signer types collide. We import the zod schemas
 * (which ARE re-exported) and derive the domain types via `z.infer`.
 */
export type Envelope = z.infer<typeof EnvelopeSchema>;
export type EnvelopeSigner = z.infer<typeof SignerSchema>;
export type EnvelopeField = z.infer<typeof FieldSchema>;
export type EnvelopeEvent = z.infer<typeof EnvelopeEventSchema>;
