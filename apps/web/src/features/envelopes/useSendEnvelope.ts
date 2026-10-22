import { useCallback, useState } from 'react';
import { isFeatureEnabled, resolveExpiresAt } from 'shared';
import {
  addEnvelopeSigner,
  createEnvelope,
  placeEnvelopeFields,
  sendEnvelope,
  setEnvelopeSigningOrder,
  patchEnvelope,
  uploadEnvelopeFile,
} from './envelopesApi';
import { addEnvelopeDocument } from '@/features/documentEditor/documents/documentsApi';
import type { FieldPlacement, PatchEnvelopeInput } from './envelopesApi';
import { toSigningOrderRequest } from '@/features/signers/signingOrder/model';
import type { SigningOrderValue } from '@/features/signers/signingOrder/model';
import type { SendReminderSettings } from './sendReminderSettings';

/**
 * Builds the one draft PATCH that runs before upload. Returns null when
 * there is nothing to change, so the default send makes no extra request.
 */
function buildDraftPatch(input: SendEnvelopeInput): PatchEnvelopeInput | null {
  const patch: {
    date_format?: string;
    timezone?: string;
    locale?: string;
    reminders_enabled?: boolean;
    expires_at?: string;
    reminder_first_after_days?: number;
    reminder_interval_days?: number;
    reminder_max?: number;
  } = {};
  if (input.remindersEnabled === false) patch.reminders_enabled = false;
  const settings = input.reminderSettings;
  if (settings !== undefined && isFeatureEnabled('customReminders')) {
    patch.expires_at = resolveExpiresAt(settings.expiry, Date.now());
    patch.reminder_first_after_days = settings.cadence.firstAfterDays;
    patch.reminder_interval_days = settings.cadence.intervalDays;
    patch.reminder_max = settings.cadence.maxReminders;
  }
  if (settings !== undefined && isFeatureEnabled('fieldMetaV2')) {
    if (settings.dateFormat !== undefined && settings.dateFormat !== '') {
      patch.date_format = settings.dateFormat;
    }
    if (settings.timezone !== undefined && settings.timezone !== '') {
      patch.timezone = settings.timezone;
    }
  }
  if (
    settings !== undefined &&
    isFeatureEnabled('i18n') &&
    settings.locale !== undefined &&
    settings.locale !== ''
  ) {
    patch.locale = settings.locale;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * One entry in `SendEnvelopeInput.signers`. Two shapes (mirrors the API DTO
 * — `apps/api/src/envelopes/dto/add-signer.dto.ts`):
 *
 *   - Contact-backed: `{ localId, contactId }` — sender selected a saved
 *     contact. `contactId` is the persisted contacts-table UUID; `localId`
 *     is whatever id the local editor uses to address this signer in
 *     placed fields (in practice for authed users `localId === contactId`).
 *   - Ad-hoc: `{ localId, email, name, color? }` — guest mode. The local
 *     editor has a synthetic id (e.g. `guest-…`) which would never pass
 *     `@IsUUID()` on the API DTO, so we send the contact details instead.
 */
export type SendEnvelopeSignerInput =
  | {
      readonly localId: string;
      readonly contactId: string;
    }
  | {
      readonly localId: string;
      readonly email: string;
      readonly name: string;
      readonly color?: string;
    };

export interface SendEnvelopeDocumentInput {
  /** Id the editor uses on `PlacedFieldValue.documentId`. */
  readonly localId: string;
  readonly title: string;
  readonly file: File | Blob;
}

/**
 * Input snapshot for the "send this draft" orchestration. The sender editor
 * keeps everything in local state while the user is placing fields. When
 * they hit Send we replay the whole draft against the API in one shot.
 */
export interface SendEnvelopeInput {
  readonly title: string;
  readonly file: File | Blob;
  readonly signers: ReadonlyArray<SendEnvelopeSignerInput>;
  /**
   * Fields with local (pixel / contact-id based) coordinates. The caller
   * passes a mapper that converts the local signer id to the server-
   * assigned signer id plus normalized 0–1 coordinates.
   */
  readonly buildFields: (
    /** Map: local signer id → server signer id returned by addSigner. */
    localSignerIdToServerSignerId: ReadonlyMap<string, string>,
    /**
     * Map: local document id → server document id. Empty unless `documents`
     * was passed (multi-document draft, flag `multiDocumentEnvelopes`).
     */
    localDocumentIdToServerDocumentId: ReadonlyMap<string, string>,
  ) => ReadonlyArray<FieldPlacement>;
  /**
   * Multi-document drafts (WP-04, flag `multiDocumentEnvelopes`): every PDF
   * in order. When present, each is added through `POST /envelopes/:id/documents`
   * in this order instead of the single legacy upload of `file`.
   */
  readonly documents?: ReadonlyArray<SendEnvelopeDocumentInput>;
  /**
   * Optional sender identity for the final POST /envelopes/:id/send.
   * Used by guest mode (anonymous Supabase session, JWT has no email);
   * authed callers leave both undefined and the server uses the JWT email.
   */
  readonly senderEmail?: string;
  readonly senderName?: string;
  /**
   * When false, the draft is patched to turn daily reminders off before
   * send. Omitted or true keeps the server default (reminders on).
   */
  readonly remindersEnabled?: boolean;
  /**
   * Expiry and reminder cadence chosen in the send controls (WP-09). Sent
   * with the draft patch only while `customReminders` is on.
   */
  readonly reminderSettings?: SendReminderSettings;
  /**
   * Signing order chosen in the recipient editor (WP-06). Used only while
   * `signingOrder` is on and the sender chose "in order": the order is set
   * through `PUT /envelopes/:id/signing-order` after the signers exist and
   * before send. Rows are keyed by the same local ids as `signers`.
   */
  readonly signingOrder?: SigningOrderValue;
}

export interface SendEnvelopeResult {
  readonly envelope_id: string;
  readonly short_code: string;
}

export type SendEnvelopePhase =
  | 'idle'
  | 'creating'
  | 'uploading'
  | 'adding-signers'
  | 'placing-fields'
  | 'sending'
  | 'done'
  | 'error';

export interface UseSendEnvelope {
  readonly phase: SendEnvelopePhase;
  readonly error: Error | null;
  readonly run: (input: SendEnvelopeInput) => Promise<SendEnvelopeResult>;
  readonly reset: () => void;
}

/**
 * Orchestrates the five sender-side API calls required to move a draft from
 * local editor state to a sealed outbound envelope:
 *
 *   1. POST /envelopes              { title }
 *   2. POST /envelopes/:id/upload   (multipart file)
 *   3. POST /envelopes/:id/signers  (per contact)
 *   4. PUT  /envelopes/:id/fields   (all fields, normalized coords)
 *      PUT  /envelopes/:id/signing-order (only when `signingOrder` is on and ordered)
 *   5. POST /envelopes/:id/send
 *
 * The hook is not a `useMutation` because we want progressive `phase` state
 * for a spinner UX and ordered aborts on the first failure.
 */
export function useSendEnvelope(): UseSendEnvelope {
  const [phase, setPhase] = useState<SendEnvelopePhase>('idle');
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback((): void => {
    setPhase('idle');
    setError(null);
  }, []);

  const run = useCallback(async (input: SendEnvelopeInput): Promise<SendEnvelopeResult> => {
    setError(null);
    try {
      setPhase('creating');
      const envelope = await createEnvelope({ title: input.title });
      const draftPatch = buildDraftPatch(input);
      if (draftPatch !== null) {
        await patchEnvelope(envelope.id, draftPatch);
      }

      setPhase('uploading');
      const localDocumentIdToServerDocumentId = new Map<string, string>();
      if (input.documents !== undefined && input.documents.length > 0) {
        // Sequential: the server assigns `ord` by arrival, so call order is
        // the order the sender arranged.
        for (const d of input.documents) {
          const added = await addEnvelopeDocument(envelope.id, d.file, d.title);
          localDocumentIdToServerDocumentId.set(d.localId, added.id);
        }
      } else {
        await uploadEnvelopeFile(envelope.id, input.file);
      }

      setPhase('adding-signers');
      const localSignerIdToServerSignerId = new Map<string, string>();
      // Sequential — `addSigner` assigns deterministic `signing_order` based
      // on call order. Parallelising would scramble that.
      for (const s of input.signers) {
        const payload =
          'contactId' in s
            ? { contact_id: s.contactId }
            : {
                email: s.email,
                name: s.name,
                ...(s.color !== undefined ? { color: s.color } : {}),
              };
        const signer = await addEnvelopeSigner(envelope.id, payload);
        localSignerIdToServerSignerId.set(s.localId, signer.id);
      }

      setPhase('placing-fields');
      const fields = input.buildFields(
        localSignerIdToServerSignerId,
        localDocumentIdToServerDocumentId,
      );
      if (fields.length > 0) {
        await placeEnvelopeFields(envelope.id, fields);
      }

      if (input.signingOrder !== undefined && isFeatureEnabled('signingOrder')) {
        const order = toSigningOrderRequest(input.signingOrder, localSignerIdToServerSignerId);
        if (order !== null) await setEnvelopeSigningOrder(envelope.id, order);
      }

      setPhase('sending');
      const payload: { sender_email?: string; sender_name?: string } = {};
      if (input.senderEmail !== undefined) payload.sender_email = input.senderEmail;
      if (input.senderName !== undefined) payload.sender_name = input.senderName;
      const sent = await sendEnvelope(envelope.id, payload);

      setPhase('done');
      return { envelope_id: sent.id, short_code: sent.short_code };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      setPhase('error');
      throw e;
    }
  }, []);

  return { phase, error, run, reset };
}
