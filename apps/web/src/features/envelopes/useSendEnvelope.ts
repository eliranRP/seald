import { useCallback, useReducer, useRef } from 'react';
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
import { patchEnvelopeAccessAuth } from '@/features/signers/accessAuth/accessAuthApi';
import { toAccessAuthRequest } from '@/features/signers/accessAuth/model';
import type { AccessAuthValue } from '@/features/signers/accessAuth/model';
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
  /**
   * Emailed one-time code choice (WP-11). Used only while `signerAccessAuth`
   * is on: saved through `PATCH /envelopes/:id/access-auth` after the signers
   * exist and before send. Rows are keyed by the same local ids as `signers`.
   */
  readonly accessAuth?: AccessAuthValue;
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

/** A step of the pipeline: every phase except the resting ones. */
export type SendEnvelopeStep = Exclude<SendEnvelopePhase, 'idle' | 'done' | 'error'>;

/**
 * The pipeline as one explicit state machine. `error` is non-null exactly
 * in the `error` phase, which also keeps the step that failed and the
 * draft the run had already created (so "nothing was sent" can be told
 * apart from "a draft exists").
 */
export type SendEnvelopeState =
  | {
      readonly phase: 'idle' | SendEnvelopeStep;
      readonly error: null;
      readonly envelopeId: string | null;
    }
  | { readonly phase: 'done'; readonly error: null; readonly envelopeId: string }
  | {
      readonly phase: 'error';
      readonly error: Error;
      readonly failedStep: SendEnvelopeStep;
      readonly envelopeId: string | null;
    };

export type SendEnvelopeAction =
  | { readonly type: 'step'; readonly step: SendEnvelopeStep }
  | { readonly type: 'created'; readonly envelopeId: string }
  | { readonly type: 'done'; readonly envelopeId: string }
  | { readonly type: 'fail'; readonly error: Error }
  | { readonly type: 'reset' };

export const SEND_ENVELOPE_IDLE: SendEnvelopeState = {
  phase: 'idle',
  error: null,
  envelopeId: null,
};

/**
 * Pure transitions. Steps only move forward from `idle` or another step;
 * `fail` records the step it interrupted; `reset` is the only way out of
 * `done` or `error`. Anything else leaves the state unchanged.
 */
export function sendEnvelopeReducer(
  state: SendEnvelopeState,
  action: SendEnvelopeAction,
): SendEnvelopeState {
  switch (action.type) {
    case 'reset':
      return SEND_ENVELOPE_IDLE;
    case 'step':
      if (state.phase === 'done' || state.phase === 'error') return state;
      return { phase: action.step, error: null, envelopeId: state.envelopeId };
    case 'created':
      if (state.phase === 'done' || state.phase === 'error') return state;
      return { ...state, envelopeId: action.envelopeId };
    case 'done':
      if (state.phase === 'idle' || state.phase === 'done' || state.phase === 'error') return state;
      return { phase: 'done', error: null, envelopeId: action.envelopeId };
    case 'fail':
      if (state.phase === 'idle' || state.phase === 'done' || state.phase === 'error') return state;
      return {
        phase: 'error',
        error: action.error,
        failedStep: state.phase,
        envelopeId: state.envelopeId,
      };
  }
}

export interface UseSendEnvelope {
  readonly phase: SendEnvelopePhase;
  readonly error: Error | null;
  /** The step that failed, while `phase` is `error`. */
  readonly failedStep: SendEnvelopeStep | null;
  /** The draft this run created, once `creating` succeeded. */
  readonly envelopeId: string | null;
  /**
   * Run the pipeline. A second call while one is in flight joins it
   * instead of creating a second envelope. `reset` drops the in-flight
   * run: its late results no longer move the state, and the next call
   * starts a new run.
   */
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
 *      PATCH /envelopes/:id/access-auth (only when `signerAccessAuth` is on and a code is asked for)
 *   5. POST /envelopes/:id/send
 *
 * The hook is not a `useMutation` because we want progressive `phase` state
 * for a spinner UX and ordered aborts on the first failure.
 */
export function useSendEnvelope(): UseSendEnvelope {
  const [state, rawDispatch] = useReducer(sendEnvelopeReducer, SEND_ENVELOPE_IDLE);
  const inFlight = useRef<Promise<SendEnvelopeResult> | null>(null);
  // Bumped by reset and by every new run: a run only moves the state while
  // it is still the current one, so a reset run cannot drag the UI out of
  // `idle` when its requests settle later.
  const generation = useRef(0);

  const reset = useCallback((): void => {
    generation.current += 1;
    inFlight.current = null;
    rawDispatch({ type: 'reset' });
  }, []);

  const pipeline = useCallback(async (input: SendEnvelopeInput): Promise<SendEnvelopeResult> => {
    generation.current += 1;
    const mine = generation.current;
    const dispatch = (action: SendEnvelopeAction): void => {
      if (generation.current === mine) rawDispatch(action);
    };
    dispatch({ type: 'reset' });
    try {
      dispatch({ type: 'step', step: 'creating' });
      const envelope = await createEnvelope({ title: input.title });
      dispatch({ type: 'created', envelopeId: envelope.id });
      const draftPatch = buildDraftPatch(input);
      if (draftPatch !== null) {
        await patchEnvelope(envelope.id, draftPatch);
      }

      dispatch({ type: 'step', step: 'uploading' });
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

      dispatch({ type: 'step', step: 'adding-signers' });
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

      dispatch({ type: 'step', step: 'placing-fields' });
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

      if (input.accessAuth !== undefined && isFeatureEnabled('signerAccessAuth')) {
        const body = toAccessAuthRequest(input.accessAuth, localSignerIdToServerSignerId);
        if (body !== null) await patchEnvelopeAccessAuth(envelope.id, body);
      }

      dispatch({ type: 'step', step: 'sending' });
      const payload: { sender_email?: string; sender_name?: string } = {};
      if (input.senderEmail !== undefined) payload.sender_email = input.senderEmail;
      if (input.senderName !== undefined) payload.sender_name = input.senderName;
      const sent = await sendEnvelope(envelope.id, payload);

      dispatch({ type: 'done', envelopeId: sent.id });
      return { envelope_id: sent.id, short_code: sent.short_code };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      dispatch({ type: 'fail', error: e });
      throw e;
    }
  }, []);

  const run = useCallback(
    (input: SendEnvelopeInput): Promise<SendEnvelopeResult> => {
      // A double click (callers build a fresh input per click) must not
      // create a second envelope: join the run already in flight. reset()
      // drops it, so a send after reset always starts a new run.
      if (inFlight.current !== null) return inFlight.current;
      const promise = pipeline(input).finally(() => {
        if (inFlight.current === promise) inFlight.current = null;
      });
      inFlight.current = promise;
      return promise;
    },
    [pipeline],
  );

  return {
    phase: state.phase,
    error: state.error,
    failedStep: state.phase === 'error' ? state.failedStep : null,
    envelopeId: state.envelopeId,
    run,
    reset,
  };
}
