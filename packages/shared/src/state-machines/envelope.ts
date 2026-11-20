import { defineMachine } from './machine';

/**
 * The envelope lifecycle (`envelopes.status`). The order of `states`
 * matches `ENVELOPE_STATUSES` in `envelope-contract.ts`.
 *
 * Archiving is orthogonal (`envelopes.archived_at`, any status) and is not
 * part of this machine.
 */
export const ENVELOPE_MACHINE = defineMachine({
  id: 'envelope',
  storedIn: 'envelopes.status',
  description:
    'A request for signatures, from draft to a sealed PDF or a stopped request. ' +
    'Every write is row-conditional on `status IN ENVELOPE_MACHINE.sources(event)`.',
  states: ['draft', 'awaiting_others', 'sealing', 'completed', 'declined', 'expired', 'canceled'],
  initial: 'draft',
  terminal: ['completed', 'declined', 'expired', 'canceled'],
  transitions: {
    send: {
      from: ['draft'],
      to: 'awaiting_others',
      description: 'The owner (or an agent) sends the draft; the first signers are invited.',
    },
    unsend: {
      from: ['awaiting_others'],
      to: 'draft',
      description:
        'The owner takes a just-sent request back inside the undo window, before any signer opened it.',
    },
    all_signed: {
      from: ['awaiting_others'],
      to: 'sealing',
      description: 'The last signer signed; a seal job is queued.',
    },
    sealed: {
      from: ['sealing'],
      to: 'completed',
      description: 'The seal worker stored the PAdES-sealed PDF and the audit trail.',
    },
    decline: {
      from: ['awaiting_others'],
      to: 'declined',
      description: 'A signer declined to sign.',
    },
    expire: {
      from: ['awaiting_others'],
      to: 'expired',
      description: 'The expiry sweep found `expires_at` in the past.',
    },
    cancel: {
      from: ['awaiting_others', 'sealing'],
      to: 'canceled',
      description: 'The owner withdrew the request.',
    },
  },
  actions: {
    tag: {
      in: ['draft', 'awaiting_others', 'sealing', 'completed', 'declined', 'expired', 'canceled'],
      description: 'Add or remove private tags (they are not part of the signed document).',
    },
    archive: {
      in: ['draft', 'awaiting_others', 'sealing', 'completed', 'declined', 'expired', 'canceled'],
      description: 'Archive or restore (`archived_at`, orthogonal to the status).',
    },
    edit_draft: {
      in: ['draft'],
      description:
        'Change documents, signers, fields, signing order, title, expiry or other settings.',
    },
    delete: { in: ['draft'], description: 'Delete the draft for good.' },
    toggle_reminders: {
      in: ['draft', 'awaiting_others'],
      description: 'Turn automatic reminders on or off while signatures can still come in.',
    },
    extend_expiry: {
      in: ['awaiting_others'],
      description:
        'Move the expiry of a request that is out for signature (`expiry_changed` event).',
    },
    remind: {
      in: ['awaiting_others'],
      description: 'Re-send the invite to a signer whose turn it is.',
    },
    correct_signer: {
      in: ['awaiting_others'],
      description: 'Fix the name or email of a signer who has not acted yet.',
    },
    sign: {
      in: ['awaiting_others'],
      description: 'A signer whose turn it is views, fills, signs or declines.',
    },
    download_sealed: {
      in: ['completed'],
      description: 'Download the sealed PDF.',
    },
    download_declined_copy: {
      in: ['declined', 'expired', 'canceled'],
      description: 'Download the stamped copy of a stopped request (audit-only seal).',
    },
  },
});

export type EnvelopeTransition = keyof typeof ENVELOPE_MACHINE.transitions;
export type EnvelopeLifecycleAction = keyof NonNullable<typeof ENVELOPE_MACHINE.actions>;

/** Transitions the owner (or an agent acting for them) fires. The rest are system or signer events. */
export const OWNER_ENVELOPE_TRANSITIONS = ['send', 'unsend', 'cancel'] as const;

export type OwnerEnvelopeAction =
  (typeof OWNER_ENVELOPE_TRANSITIONS)[number] | Exclude<EnvelopeLifecycleAction, 'sign'>;

/**
 * What the status lets the owner do, in a stable order: owner transitions
 * first, then gated actions. The single answer to "can I remind / cancel /
 * download this?" for the SPA, the API and agents. Other rules (the remind
 * hour, the unsend window, approvals) still apply on top.
 */
export function ownerEnvelopeActions(status: string): readonly OwnerEnvelopeAction[] {
  const owner: readonly string[] = OWNER_ENVELOPE_TRANSITIONS;
  const transitions = ENVELOPE_MACHINE.events(status).filter(
    (e): e is (typeof OWNER_ENVELOPE_TRANSITIONS)[number] => owner.includes(e),
  );
  const actions = ENVELOPE_MACHINE.allowedActions(status).filter(
    (a): a is Exclude<EnvelopeLifecycleAction, 'sign'> => a !== 'sign',
  );
  return [...transitions, ...actions];
}
