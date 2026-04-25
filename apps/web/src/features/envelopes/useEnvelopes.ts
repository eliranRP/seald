import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EnvelopeListItem } from 'shared';
import type {
  CancelEnvelopeResponse,
  Envelope,
  EnvelopeEventsResponse,
  EnvelopeField,
  EnvelopeListResponse,
  EnvelopeSigner,
  FieldPlacement,
  ListEnvelopesParams,
} from './envelopesApi';
import {
  addEnvelopeSigner,
  cancelEnvelope,
  createEnvelope,
  deleteEnvelope,
  getEnvelope,
  listEnvelopeEvents,
  listEnvelopes,
  placeEnvelopeFields,
  removeEnvelopeSigner,
  sendEnvelope,
  uploadEnvelopeFile,
} from './envelopesApi';

export const ENVELOPES_KEY = ['envelopes'] as const;
export const ENVELOPE_KEY = (id: string): readonly [string, string] => ['envelope', id] as const;
export const ENVELOPE_EVENTS_KEY = (id: string): readonly [string, string, string] =>
  ['envelope', id, 'events'] as const;

/**
 * Lists the signed-in user's envelopes. Pass `enabled: false` for guests
 * or before the session hydrates.
 */
export function useEnvelopesQuery(enabled: boolean, params: ListEnvelopesParams = {}) {
  return useQuery<EnvelopeListResponse>({
    queryKey: [...ENVELOPES_KEY, params],
    queryFn: ({ signal }) => listEnvelopes(params, signal),
    enabled,
  });
}

export function useEnvelopeQuery(id: string, enabled: boolean) {
  return useQuery<Envelope>({
    queryKey: ENVELOPE_KEY(id),
    queryFn: ({ signal }) => getEnvelope(id, signal),
    enabled: enabled && Boolean(id),
  });
}

/**
 * Fetches the audit-trail event log for an envelope. Used by the
 * EnvelopeDetailPage timeline. Reuses React-Query's shared cache so
 * re-mounts are instant.
 */
export function useEnvelopeEventsQuery(id: string, enabled: boolean) {
  return useQuery<EnvelopeEventsResponse>({
    queryKey: ENVELOPE_EVENTS_KEY(id),
    queryFn: ({ signal }) => listEnvelopeEvents(id, signal),
    enabled: enabled && Boolean(id),
  });
}

export function useCreateEnvelopeMutation() {
  const qc = useQueryClient();
  return useMutation<Envelope, Error, { readonly title: string }>({
    mutationFn: (input) => createEnvelope(input),
    onSuccess: (envelope) => {
      qc.invalidateQueries({ queryKey: ENVELOPES_KEY });
      qc.setQueryData(ENVELOPE_KEY(envelope.id), envelope);
    },
  });
}

export interface UploadFileArgs {
  readonly envelopeId: string;
  readonly file: File | Blob;
}

export function useUploadEnvelopeFileMutation() {
  const qc = useQueryClient();
  return useMutation<{ readonly pages: number; readonly sha256: string }, Error, UploadFileArgs>({
    mutationFn: ({ envelopeId, file }) => uploadEnvelopeFile(envelopeId, file),
    onSuccess: (_result, args) => {
      qc.invalidateQueries({ queryKey: ENVELOPE_KEY(args.envelopeId) });
    },
  });
}

export interface AddSignerArgs {
  readonly envelopeId: string;
  readonly contactId: string;
}

export function useAddEnvelopeSignerMutation() {
  const qc = useQueryClient();
  return useMutation<EnvelopeSigner, Error, AddSignerArgs>({
    mutationFn: ({ envelopeId, contactId }) => addEnvelopeSigner(envelopeId, contactId),
    onSuccess: (_signer, args) => {
      qc.invalidateQueries({ queryKey: ENVELOPE_KEY(args.envelopeId) });
    },
  });
}

export interface RemoveSignerArgs {
  readonly envelopeId: string;
  readonly signerId: string;
}

export function useRemoveEnvelopeSignerMutation() {
  const qc = useQueryClient();
  return useMutation<void, Error, RemoveSignerArgs>({
    mutationFn: ({ envelopeId, signerId }) => removeEnvelopeSigner(envelopeId, signerId),
    onSuccess: (_void, args) => {
      qc.invalidateQueries({ queryKey: ENVELOPE_KEY(args.envelopeId) });
    },
  });
}

export interface PlaceFieldsArgs {
  readonly envelopeId: string;
  readonly fields: ReadonlyArray<FieldPlacement>;
}

export function usePlaceEnvelopeFieldsMutation() {
  const qc = useQueryClient();
  return useMutation<ReadonlyArray<EnvelopeField>, Error, PlaceFieldsArgs>({
    mutationFn: ({ envelopeId, fields }) => placeEnvelopeFields(envelopeId, fields),
    onSuccess: (_fields, args) => {
      qc.invalidateQueries({ queryKey: ENVELOPE_KEY(args.envelopeId) });
    },
  });
}

export function useSendEnvelopeMutation() {
  const qc = useQueryClient();
  return useMutation<Envelope, Error, string>({
    mutationFn: (id) => sendEnvelope(id),
    onSuccess: (envelope) => {
      qc.invalidateQueries({ queryKey: ENVELOPES_KEY });
      qc.setQueryData(ENVELOPE_KEY(envelope.id), envelope);
    },
  });
}

export function useDeleteEnvelopeMutation() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteEnvelope(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENVELOPES_KEY });
    },
  });
}

/**
 * Sender-initiated cancel ("withdraw") of a sent envelope. Mirrors
 * `useDeleteEnvelopeMutation` but targets the `/cancel` endpoint —
 * use this for `awaiting_others` / `sealing` envelopes; the delete-draft
 * mutation handles `draft`.
 */
export function useCancelEnvelopeMutation() {
  const qc = useQueryClient();
  return useMutation<CancelEnvelopeResponse, Error, string>({
    mutationFn: (id) => cancelEnvelope(id),
    onSuccess: (_res, id) => {
      // Invalidate both the list and the detail query so the UI re-pulls
      // the canonical `canceled` status. Don't optimistically setQueryData
      // — the API also recomputes signers.access_token_hash side-effects
      // and we want the next read to round-trip.
      qc.invalidateQueries({ queryKey: ENVELOPES_KEY });
      qc.invalidateQueries({ queryKey: ENVELOPE_KEY(id) });
      qc.invalidateQueries({ queryKey: ENVELOPE_EVENTS_KEY(id) });
    },
  });
}

export type { EnvelopeListItem };
