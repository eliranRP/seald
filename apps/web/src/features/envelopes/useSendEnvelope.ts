import { useCallback, useState } from 'react';
import {
  addEnvelopeSigner,
  createEnvelope,
  placeEnvelopeFields,
  sendEnvelope,
  uploadEnvelopeFile,
} from './envelopesApi';
import type { FieldPlacement } from './envelopesApi';

/**
 * Input snapshot for the "send this draft" orchestration. The sender editor
 * keeps everything in local state while the user is placing fields. When
 * they hit Send we replay the whole draft against the API in one shot.
 */
export interface SendEnvelopeInput {
  readonly title: string;
  readonly file: File | Blob;
  readonly signers: ReadonlyArray<{
    /** Contact id in the Seald contacts database. */
    readonly contactId: string;
  }>;
  /**
   * Fields with local (pixel / contact-id based) coordinates. The caller
   * passes a mapper that converts the local contact id to the server-
   * assigned signer id plus normalized 0–1 coordinates.
   */
  readonly buildFields: (
    /** Map: local contact id → server signer id returned by addSigner. */
    contactIdToSignerId: ReadonlyMap<string, string>,
  ) => ReadonlyArray<FieldPlacement>;
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

      setPhase('uploading');
      await uploadEnvelopeFile(envelope.id, input.file);

      setPhase('adding-signers');
      const contactIdToSignerId = new Map<string, string>();
      // Sequential — `addSigner` assigns deterministic `signing_order` based
      // on call order. Parallelising would scramble that.
      for (const s of input.signers) {
        // eslint-disable-next-line no-await-in-loop
        const signer = await addEnvelopeSigner(envelope.id, s.contactId);
        contactIdToSignerId.set(s.contactId, signer.id);
      }

      setPhase('placing-fields');
      const fields = input.buildFields(contactIdToSignerId);
      if (fields.length > 0) {
        await placeEnvelopeFields(envelope.id, fields);
      }

      setPhase('sending');
      const sent = await sendEnvelope(envelope.id);

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
