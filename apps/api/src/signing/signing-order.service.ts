import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DeliveryMode } from 'shared';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { insertOutboundEmailIdempotent } from '../email/insert-idempotent';
import { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import type { Envelope, StepInvite } from '../envelopes/envelopes.repository';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { stepOf } from './signing-order';

/**
 * The invite payload. It holds no signing link: the dispatcher mints the
 * token when the mail goes out (MCP Insert A). Shared by `send` (step 1,
 * or everyone in parallel mode) and by later sequential steps.
 */
export function inviteEmailPayload(
  envelope: Pick<Envelope, 'title' | 'short_code'>,
  sender: { readonly email: string; readonly name: string | null },
  publicUrl: string,
): Record<string, unknown> {
  return {
    sender_name: sender.name ?? sender.email,
    sender_email: sender.email,
    envelope_title: envelope.title,
    // Canonical verify route is `/verify/<short_code>` — matches the SPA + audit-pdf QR.
    verify_url: `${publicUrl}/verify/${envelope.short_code}`,
    short_code: envelope.short_code,
    public_url: publicUrl,
  };
}

/**
 * Signing order (WP-05, flag `signingOrder`). The step rules live in
 * `signing-order.ts`; the transactional stamps in
 * `signing-order.repository.pg.ts`. This service is the orchestration
 * around them:
 *
 *  - `setOrder`: the sender sets the delivery mode and each signer's
 *    order on a draft.
 *  - `startStep`: after a submit's transaction started the next step,
 *    append the chained `step_started` event and queue one invite per
 *    signer of that step.
 */
@Injectable()
export class SigningOrderService {
  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly outboundEmails: OutboundEmailsRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async setOrder(
    owner_id: string,
    envelope_id: string,
    input: {
      readonly delivery_mode: DeliveryMode;
      readonly signers?: ReadonlyArray<{
        readonly signer_id: string;
        readonly signing_order: number;
      }>;
    },
  ): Promise<Envelope> {
    const envelope = await this.repo.findByIdForOwner(owner_id, envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');
    const orders = input.signers ?? [];
    if (input.signers !== undefined) {
      // Every signer exactly once, so a stale editor cannot leave one at
      // an order it never saw.
      const known = new Set(envelope.signers.map((s) => s.id));
      const seen = new Set<string>();
      for (const o of orders) {
        if (!known.has(o.signer_id) || seen.has(o.signer_id)) {
          throw new BadRequestException('signing_order_invalid');
        }
        seen.add(o.signer_id);
      }
      if (seen.size !== known.size) throw new BadRequestException('signing_order_invalid');
    }
    const updated = await this.repo.setSigningOrder(envelope_id, {
      delivery_mode: input.delivery_mode,
      orders,
    });
    if (!updated) throw new ConflictException('envelope_not_draft');
    return updated;
  }

  /**
   * Record and invite a step the submit transaction just started. The
   * event goes through appendEvent, so it joins the hash chain (S.6). The
   * invite rows carry a per-signer dedupe key, so a repeated call queues
   * nothing twice.
   */
  async startStep(envelope: Envelope, invite: StepInvite): Promise<void> {
    const event = await this.repo.appendEvent({
      envelope_id: envelope.id,
      actor_kind: 'system',
      event_type: 'step_started',
      metadata: {
        step: invite.step,
        signing_order: invite.signing_order,
        signer_ids: [...invite.signer_ids],
      },
    });
    await this.queueInvites(envelope, invite.signer_ids, event.id);
  }

  /**
   * Step sweep backstop: re-run a step start whose after-commit half was
   * lost. The step's `step_started` event is appended only if it is not
   * in the chain yet (send writes step 1's; a crashed submit may have
   * written step N's before failing); invites for `signerIds` are queued
   * with the same per-signer dedupe keys, so nothing goes out twice.
   */
  async resumeStep(
    envelope: Envelope,
    signingOrder: number,
    signerIds: ReadonlyArray<string>,
  ): Promise<void> {
    const step = stepOf(envelope.signers, signingOrder);
    const events = await this.repo.listEventsForEnvelope(envelope.id);
    const existing = events.find(
      (e) =>
        e.event_type === 'step_started' &&
        e.metadata['step'] === step &&
        e.metadata['signing_order'] === signingOrder,
    );
    const eventId =
      existing?.id ??
      (
        await this.repo.appendEvent({
          envelope_id: envelope.id,
          actor_kind: 'system',
          event_type: 'step_started',
          metadata: {
            step,
            signing_order: signingOrder,
            signer_ids: envelope.signers
              .filter(
                (s) =>
                  s.signing_order === signingOrder &&
                  s.signed_at === null &&
                  s.declined_at === null,
              )
              .map((s) => s.id),
            resumed: true,
          },
        })
      ).id;
    await this.queueInvites(envelope, signerIds, eventId);
  }

  private async queueInvites(
    envelope: Envelope,
    signerIds: ReadonlyArray<string>,
    sourceEventId: string,
  ): Promise<void> {
    const senderEmail = envelope.sender_email;
    if (!senderEmail) return;
    const publicUrl = this.env.APP_PUBLIC_URL.replace(/\/$/, '');
    const payload = inviteEmailPayload(
      envelope,
      { email: senderEmail, name: envelope.sender_name },
      publicUrl,
    );
    for (const signerId of signerIds) {
      const signer = envelope.signers.find((s) => s.id === signerId);
      if (!signer) continue;
      await insertOutboundEmailIdempotent(this.outboundEmails, {
        envelope_id: envelope.id,
        signer_id: signer.id,
        kind: 'invite',
        to_email: signer.email,
        to_name: signer.name,
        source_event_id: sourceEventId,
        dedupe_key: `invite_step:${envelope.id}:${signer.id}`,
        payload,
      });
    }
  }
}
