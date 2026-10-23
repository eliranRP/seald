import type { Kysely, Transaction } from 'kysely';
import type { DeliveryMode } from 'shared';
import type { Database } from '../../db/schema';
import type { SetSigningOrderInput, StepInvite } from '../envelopes/envelopes.repository';
import { initialInvitees, nextStepInvitees } from './signing-order';

/**
 * Signing-order queries (WP-05, migration 0023). They run inside the
 * transactions `EnvelopesPgRepository` already opens for send and submit,
 * so the legacy repository only gains one call per method. Kept here so
 * new queries stay out of the 1.7k-line legacy file.
 */

/**
 * Inside `sendDraft`: stamp `invited_at` on the signers this send
 * invites (everyone for parallel, step 1 for sequential). Returns their
 * ids. Row-conditional on `invited_at is null`, so a retried send never
 * moves an earlier stamp.
 */
export async function stampInitialInvites(
  trx: Transaction<Database>,
  envelope_id: string,
  mode: DeliveryMode,
  nowIso: string,
): Promise<string[]> {
  const signers = await trx
    .selectFrom('envelope_signers')
    .select(['id', 'signing_order', 'signed_at', 'declined_at'])
    .where('envelope_id', '=', envelope_id)
    .execute();
  const ids = initialInvitees(mode, signers).map((s) => s.id);
  if (ids.length === 0) return [];
  await trx
    .updateTable('envelope_signers')
    .set({ invited_at: nowIso })
    .where('envelope_id', '=', envelope_id)
    .where('id', 'in', ids)
    .where('invited_at', 'is', null)
    .execute();
  return ids;
}

/**
 * Inside `submitSigner`, after the signature is stamped and while the
 * envelope row is locked FOR UPDATE: if the submit completed its step,
 * stamp `invited_at` on the next step's signers and return them.
 *
 * Exactly-once: concurrent final submits of a step queue on the envelope
 * row lock. The first to commit stamps the next step; the others then see
 * `invited_at` set and return null. The UPDATE is also conditional on
 * `invited_at is null`, and only the rows it actually changed are
 * returned, so even without the lock no step is reported twice.
 */
export async function inviteNextStep(
  trx: Transaction<Database>,
  envelope_id: string,
  nowIso: string,
): Promise<StepInvite | null> {
  const envelope = await trx
    .selectFrom('envelopes')
    .select(['delivery_mode', 'status'])
    .where('id', '=', envelope_id)
    .executeTakeFirst();
  if (!envelope || envelope.status !== 'awaiting_others') return null;
  if (envelope.delivery_mode !== 'sequential') return null;
  const signers = await trx
    .selectFrom('envelope_signers')
    .select(['id', 'signing_order', 'signed_at', 'declined_at', 'invited_at'])
    .where('envelope_id', '=', envelope_id)
    .execute();
  const next = nextStepInvitees('sequential', signers);
  if (!next) return null;
  const stamped = await trx
    .updateTable('envelope_signers')
    .set({ invited_at: nowIso })
    .where('envelope_id', '=', envelope_id)
    .where(
      'id',
      'in',
      next.signers.map((s) => s.id),
    )
    .where('invited_at', 'is', null)
    .where('signed_at', 'is', null)
    .where('declined_at', 'is', null)
    .returning(['id'])
    .execute();
  if (stamped.length === 0) return null;
  return {
    step: next.step,
    signing_order: next.signingOrder,
    signer_ids: stamped.map((r) => r.id),
  };
}

/**
 * `PUT /envelopes/:id/signing-order`: one transaction, draft only (the
 * envelope row is locked and re-checked). Returns false when the
 * envelope is missing or no longer a draft.
 */
export async function setSigningOrder(
  db: Kysely<Database>,
  envelope_id: string,
  input: SetSigningOrderInput,
): Promise<boolean> {
  return db.transaction().execute(async (trx) => {
    const env = await trx
      .selectFrom('envelopes')
      .select(['status'])
      .where('id', '=', envelope_id)
      .forUpdate()
      .executeTakeFirst();
    if (!env || env.status !== 'draft') return false;
    const now = new Date().toISOString();
    await trx
      .updateTable('envelopes')
      .set({ delivery_mode: input.delivery_mode, updated_at: now })
      .where('id', '=', envelope_id)
      .where('status', '=', 'draft')
      .execute();
    for (const o of input.orders) {
      await trx
        .updateTable('envelope_signers')
        .set({ signing_order: o.signing_order })
        .where('envelope_id', '=', envelope_id)
        .where('id', '=', o.signer_id)
        .execute();
    }
    return true;
  });
}
