import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import {
  SealSweepRepository,
  type FindSealSweepCandidatesInput,
  type SealSweepCandidate,
  type SealSweepReason,
} from './seal-sweep.service';

interface CandidateRow {
  envelope_id: string;
  status: 'sealing' | 'awaiting_others';
  all_signed_at: Date | string;
  reason: SealSweepReason;
}

@Injectable()
export class SealSweepPgRepository extends SealSweepRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async findCandidates(input: FindSealSweepCandidatesInput): Promise<SealSweepCandidate[]> {
    const signedBefore = input.signedBefore.toISOString();
    const signedAfter = input.signedAfter ? input.signedAfter.toISOString() : null;
    const staleBefore = input.runningStartedBefore.toISOString();
    const result = await sql<CandidateRow>`
      with signed as (
        select envelope_id, max(created_at) as all_signed_at
        from envelope_events
        where event_type = 'all_signed'
        group by envelope_id
      )
      select e.id as envelope_id, e.status, s.all_signed_at,
        case
          when j.id is null then 'no_job'
          when j.status = 'failed' and j.attempts < j.max_attempts then 'failed_retryable'
          when j.status = 'failed' then 'exhausted'
          when j.status = 'running' and j.attempts < j.max_attempts then 'stale_running'
          else 'exhausted'
        end as reason
      from envelopes e
      join signed s on s.envelope_id = e.id
      left join envelope_jobs j on j.envelope_id = e.id
      where (
          e.status = 'sealing'
          or (e.status = 'awaiting_others'
              and not exists (
                select 1 from envelope_signers sg
                where sg.envelope_id = e.id and sg.signed_at is null))
        )
        and s.all_signed_at <= ${signedBefore}::timestamptz
        and (${signedAfter}::timestamptz is null or s.all_signed_at > ${signedAfter}::timestamptz)
        and (
          j.id is null
          or j.status = 'failed'
          or (j.status = 'running' and j.started_at < ${staleBefore}::timestamptz)
        )
      order by s.all_signed_at desc
      limit ${input.limit}
    `.execute(this.db);
    return result.rows.map((r) => ({
      envelopeId: r.envelope_id,
      envelopeStatus: r.status,
      allSignedAt: new Date(r.all_signed_at),
      reason: r.reason,
    }));
  }

  async requeue(candidate: SealSweepCandidate, runningStartedBefore: Date): Promise<boolean> {
    const staleBefore = runningStartedBefore.toISOString();
    return this.db.transaction().execute(async (trx) => {
      let acted = false;
      if (candidate.reason === 'no_job') {
        // Unique(envelope_id) is the idempotency key: a concurrent sweep or
        // a late enqueue makes this a no-op.
        const inserted = await sql<{ id: string }>`
          insert into envelope_jobs (envelope_id, kind)
          values (${candidate.envelopeId}, 'seal')
          on conflict (envelope_id) do nothing
          returning id
        `.execute(trx);
        acted = inserted.rows.length > 0;
      } else if (candidate.reason === 'failed_retryable' || candidate.reason === 'stale_running') {
        const failed = candidate.reason === 'failed_retryable';
        const note = failed ? 'requeued by seal sweep' : 'reclaimed stale running job (seal sweep)';
        const rearmed = await sql<{ id: string }>`
          with locked as (
            select id from envelope_jobs
            where envelope_id = ${candidate.envelopeId}
              and attempts < max_attempts
              and (
                (${failed}::boolean and status = 'failed')
                or (not ${failed}::boolean and status = 'running'
                    and started_at < ${staleBefore}::timestamptz)
              )
            for update skip locked
          )
          update envelope_jobs j
          set status = 'pending',
              scheduled_for = now(),
              started_at = null,
              finished_at = null,
              last_error = ${note}
          from locked
          where j.id = locked.id
          returning j.id
        `.execute(trx);
        acted = rearmed.rows.length > 0;
      }
      if (acted && candidate.envelopeStatus === 'awaiting_others') {
        // Fully signed but the status flip never landed; same guarded
        // transition the submit path performs.
        await sql`
          update envelopes set status = 'sealing', updated_at = now()
          where id = ${candidate.envelopeId} and status = 'awaiting_others'
        `.execute(trx);
      }
      return acted;
    });
  }
}
