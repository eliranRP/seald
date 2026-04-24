import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EnvelopeListItem } from 'shared';
import type {
  Envelope,
  EnvelopeField,
  EnvelopeListResponse,
  EnvelopeSigner,
  FieldPlacement,
  ListEnvelopesParams,
} from './envelopesApi';
import {
  addEnvelopeSigner,
  createEnvelope,
  deleteEnvelope,
  getEnvelope,
  listEnvelopes,
  placeEnvelopeFields,
  removeEnvelopeSigner,
  sendEnvelope,
  uploadEnvelopeFile,
} from './envelopesApi';

export const ENVELOPES_KEY = ['envelopes'] as const;
export const ENVELOPE_KEY = (id: string): readonly [string, string] => ['envelope', id] as const;

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

export type { EnvelopeListItem };
