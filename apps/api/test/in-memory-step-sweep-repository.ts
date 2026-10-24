import { activeSigningOrder } from '../src/signing/signing-order';
import { StepSweepRepository, type StalledStep } from '../src/signing/step-sweep.service';
import type { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import type { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';

/**
 * Test double for StepSweepPgRepository over the in-memory envelopes
 * (invited_at side map) and outbox rows. Same predicate as the SQL.
 */
export class InMemoryStepSweepRepository extends StepSweepRepository {
  constructor(
    private readonly envelopes: InMemoryEnvelopesRepository,
    private readonly outbound: InMemoryOutboundEmailsRepository,
  ) {
    super();
  }

  private stalledSigners(step: StalledStep | null, invitedBefore: Date) {
    const out: Array<{ envelopeId: string; signerId: string; order: number }> = [];
    for (const env of this.envelopes.envelopes.values()) {
      if (env.status !== 'awaiting_others' || env.delivery_mode !== 'sequential') continue;
      if (step && step.envelopeId !== env.id) continue;
      const active = activeSigningOrder(env.signers);
      for (const s of env.signers) {
        if (s.signing_order !== active || s.signed_at !== null || s.declined_at !== null) continue;
        if (step && s.signing_order !== step.signingOrder) continue;
        const invitedAt = this.envelopes.invitedAt.get(s.id);
        if (!invitedAt || Date.parse(invitedAt) > invitedBefore.getTime()) continue;
        const invited = this.outbound.rows.some(
          (r) =>
            r.envelope_id === env.id &&
            r.signer_id === s.id &&
            (r.kind === 'invite' || r.kind === 'your_turn') &&
            (r.dedupe_key === `invite_step:${env.id}:${s.id}` ||
              Date.parse(r.created_at) >= Date.parse(invitedAt) - 60_000),
        );
        if (!invited) out.push({ envelopeId: env.id, signerId: s.id, order: s.signing_order });
      }
    }
    return out;
  }

  async findStalledSteps(invitedBefore: Date, limit: number): Promise<StalledStep[]> {
    const seen = new Map<string, StalledStep>();
    for (const s of this.stalledSigners(null, invitedBefore)) {
      seen.set(`${s.envelopeId}:${s.order}`, { envelopeId: s.envelopeId, signingOrder: s.order });
    }
    return [...seen.values()].slice(0, limit);
  }

  async claimStalledStep(step: StalledStep, invitedBefore: Date): Promise<string[]> {
    const now = new Date().toISOString();
    const ids = this.stalledSigners(step, invitedBefore).map((s) => s.signerId);
    for (const id of ids) this.envelopes.invitedAt.set(id, now);
    return ids;
  }
}
