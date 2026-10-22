import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import { StepSweepRepository, type StalledStep } from './step-sweep.service';

/**
 * The stalled predicate, on signer `s` of envelope `e`: the envelope is
 * awaiting and sequential, the signer is in the active step (lowest order
 * with someone unsigned), was invited at or before the cutoff, has neither
 * signed nor declined, and has no invite for this step: none carrying the
 * step-invite dedupe key, and none queued since `invited_at` (a minute of
 * slack absorbs app/database clock skew; step 1 invites from `send` carry
 * no dedupe key). Claims stamp `invited_at` with the database clock.
 */
@Injectable()
export class StepSweepPgRepository extends StepSweepRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async findStalledSteps(invitedBefore: Date, limit: number): Promise<StalledStep[]> {
    const cutoff = invitedBefore.toISOString();
    const result = await sql<{ envelope_id: string; signing_order: number }>`
      select distinct s.envelope_id, s.signing_order
        from envelope_signers s
        join envelopes e on e.id = s.envelope_id
       where e.status = 'awaiting_others'
         and e.delivery_mode = 'sequential'
         and s.invited_at is not null
         and s.invited_at <= ${cutoff}::timestamptz
         and s.signed_at is null
         and s.declined_at is null
         and s.signing_order = (
           select min(a.signing_order) from envelope_signers a
            where a.envelope_id = s.envelope_id
              and a.signed_at is null and a.declined_at is null)
         and not exists (
           select 1 from outbound_emails o
            where o.envelope_id = s.envelope_id
              and o.signer_id = s.id
              and o.kind = 'invite'
              and (o.dedupe_key = 'invite_step:' || s.envelope_id || ':' || s.id
                   or o.created_at >= s.invited_at - interval '1 minute'))
       order by s.envelope_id
       limit ${limit}
    `.execute(this.db);
    return result.rows.map((r) => ({
      envelopeId: r.envelope_id,
      signingOrder: Number(r.signing_order),
    }));
  }

  async claimStalledStep(step: StalledStep, invitedBefore: Date): Promise<string[]> {
    const cutoff = invitedBefore.toISOString();
    const result = await sql<{ id: string }>`
      update envelope_signers s
         set invited_at = now()
       where s.envelope_id = ${step.envelopeId}
         and s.signing_order = ${step.signingOrder}
         and s.invited_at is not null
         and s.invited_at <= ${cutoff}::timestamptz
         and s.signed_at is null
         and s.declined_at is null
         and exists (
           select 1 from envelopes e
            where e.id = s.envelope_id
              and e.status = 'awaiting_others'
              and e.delivery_mode = 'sequential')
         and not exists (
           select 1 from outbound_emails o
            where o.envelope_id = s.envelope_id
              and o.signer_id = s.id
              and o.kind = 'invite'
              and (o.dedupe_key = 'invite_step:' || s.envelope_id || ':' || s.id
                   or o.created_at >= s.invited_at - interval '1 minute'))
      returning s.id
    `.execute(this.db);
    return result.rows.map((r) => r.id);
  }
}
