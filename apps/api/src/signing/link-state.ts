import { ConflictException, GoneException } from '@nestjs/common';
import type { Envelope, EnvelopeSigner } from '../envelopes/envelopes.repository';
import { activeSigningOrder } from './signing-order';

/**
 * Machine reason on a refused signer link, so the SPA can pick the right
 * screen. The `error` slug of each response is unchanged; `reason` is
 * additive (the exception filter copies it into the body).
 */
export type LinkReason = 'already_signed' | 'declined' | 'not_your_turn' | 'expired' | 'canceled';

/** Why a signer can no longer act on an envelope that is not open to them. */
export function terminalReason(
  envelope: Pick<Envelope, 'status'>,
  signer: Pick<EnvelopeSigner, 'signed_at' | 'declined_at'>,
): LinkReason {
  if (signer.signed_at !== null) return 'already_signed';
  if (signer.declined_at !== null) return 'declined';
  if (envelope.status === 'expired') return 'expired';
  return 'canceled';
}

/** Extra fields a link-state screen shows: the sender's name, and when the signer signed. */
function hints(
  envelope: Pick<Envelope, 'sender_name'>,
  signer?: Pick<EnvelopeSigner, 'signed_at'>,
): { sender_name?: string; signed_at?: string } {
  return {
    ...(envelope.sender_name ? { sender_name: envelope.sender_name } : {}),
    ...(signer?.signed_at ? { signed_at: signer.signed_at } : {}),
  };
}

export function terminalGone(
  envelope: Pick<Envelope, 'status' | 'sender_name'>,
  signer: Pick<EnvelopeSigner, 'signed_at' | 'declined_at'>,
): GoneException {
  return new GoneException({
    message: 'envelope_terminal',
    reason: terminalReason(envelope, signer),
    ...hints(envelope, signer),
  });
}

/** 409 for a signer who already signed (`already_signed`) or declined (`declined`). */
export function alreadyActed(
  envelope: Pick<Envelope, 'sender_name'>,
  signer: Pick<EnvelopeSigner, 'signed_at' | 'declined_at'>,
): ConflictException {
  const signed = signer.signed_at !== null;
  return new ConflictException({
    message: signed ? 'already_signed' : 'already_declined',
    reason: (signed ? 'already_signed' : 'declined') satisfies LinkReason,
    ...hints(envelope, signer),
  });
}

/** First name of the signer whose step is active, for the "not your turn" screen. */
function waitingOn(envelope: Pick<Envelope, 'signers'>): string | undefined {
  const active = activeSigningOrder(envelope.signers);
  const first = envelope.signers.find(
    (s) => s.signing_order === active && s.signed_at === null && s.declined_at === null,
  );
  const word = first?.name.trim().split(/\s+/)[0];
  return word ? word : undefined;
}

export function notYourTurn(
  envelope: Pick<Envelope, 'signers' | 'sender_name'>,
): ConflictException {
  const waiting = waitingOn(envelope);
  return new ConflictException({
    message: 'not_your_turn',
    reason: 'not_your_turn' satisfies LinkReason,
    ...(waiting !== undefined ? { waiting_on: waiting } : {}),
    ...hints(envelope),
  });
}
