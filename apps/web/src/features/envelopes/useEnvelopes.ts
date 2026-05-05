import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EnvelopeListItem } from 'shared';
import type {
  AddEnvelopeSignerInput,
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

/**
 * Hierarchical query-key factory for envelope queries (RQ-1.1, RQ-1.4).
 * All keys share the `['envelopes']` root so a single
 * `invalidateQueries({ queryKey: envelopeKeys.all })` sweeps the entire
 * family — lists, details, and events alike.
 */
export const envelopeKeys = {
  all: ['envelopes'] as const,
  lists: () => [...envelopeKeys.all, 'list'] as const,
  list: (params: ListEnvelopesParams) => [...envelopeKeys.lists(), params] as const,
  details: () => [...envelopeKeys.all, 'detail'] as const,
  detail: (id: string) => [...envelopeKeys.details(), id] as const,
  events: (id: string) => [...envelopeKeys.all, 'detail', id, 'events'] as const,
} as const;

/** @deprecated Use `envelopeKeys.all` — kept for backward compat with tests. */
export const ENVELOPES_KEY = envelopeKeys.all;
/** @deprecated Use `envelopeKeys.detail(id)` — kept for backward compat. */
export const ENVELOPE_KEY = (id: string) => envelopeKeys.detail(id);
/** @deprecated Use `envelopeKeys.events(id)` — kept for backward compat. */
export const ENVELOPE_EVENTS_KEY = (id: string) => envelopeKeys.events(id);

/**
 * Lists the signed-in user's envelopes. Pass `enabled: false` for guests
 * or before the session hydrates.
 */
export function useEnvelopesQuery(enabled: boolean, params: ListEnvelopesParams = {}) {
  return useQuery<EnvelopeListResponse>({
    queryKey: envelopeKeys.list(params),
    queryFn: ({ signal }) => listEnvelopes(params, signal),
    enabled,
  });
}

export function useEnvelopeQuery(id: string, enabled: boolean) {
  return useQuery<Envelope>({
    queryKey: envelopeKeys.detail(id),
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
    queryKey: envelopeKeys.events(id),
    queryFn: ({ signal }) => listEnvelopeEvents(id, signal),
    enabled: enabled && Boolean(id),
  });
}

export function useCreateEnvelopeMutation() {
  const qc = useQueryClient();
  return useMutation<Envelope, Error, { readonly title: string }>({
    mutationFn: (input) => createEnvelope(input),
    onSuccess: (envelope) => {
      qc.invalidateQueries({ queryKey: envelopeKeys.lists() });
      qc.setQueryData(envelopeKeys.detail(envelope.id), envelope);
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
      qc.invalidateQueries({ queryKey: envelopeKeys.detail(args.envelopeId) });
    },
  });
}

export type AddSignerArgs = {
  readonly envelopeId: string;
} & AddEnvelopeSignerInput;

export function useAddEnvelopeSignerMutation() {
  const qc = useQueryClient();
  return useMutation<EnvelopeSigner, Error, AddSignerArgs>({
    mutationFn: ({ envelopeId, ...input }) => addEnvelopeSigner(envelopeId, input),
    onSuccess: (_signer, args) => {
      qc.invalidateQueries({ queryKey: envelopeKeys.detail(args.envelopeId) });
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
      qc.invalidateQueries({ queryKey: envelopeKeys.detail(args.envelopeId) });
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
      qc.invalidateQueries({ queryKey: envelopeKeys.detail(args.envelopeId) });
    },
  });
}

export function useSendEnvelopeMutation() {
  const qc = useQueryClient();
  return useMutation<Envelope, Error, string>({
    mutationFn: (id) => sendEnvelope(id),
    onSuccess: (envelope) => {
      qc.invalidateQueries({ queryKey: envelopeKeys.lists() });
      qc.setQueryData(envelopeKeys.detail(envelope.id), envelope);
    },
  });
}

export function useDeleteEnvelopeMutation() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteEnvelope(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: envelopeKeys.lists() });
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
      // Invalidate the entire envelope family (lists + this detail + events)
      // so the UI re-pulls the canonical `canceled` status. Don't
      // optimistically setQueryData — the API also recomputes
      // signers.access_token_hash side-effects and we want the next read
      // to round-trip. With hierarchical keys a single `envelopeKeys.all`
      // invalidation would catch everything, but we scope narrowly to
      // avoid unnecessary refetches on unrelated detail queries.
      qc.invalidateQueries({ queryKey: envelopeKeys.lists() });
      qc.invalidateQueries({ queryKey: envelopeKeys.detail(id) });
      qc.invalidateQueries({ queryKey: envelopeKeys.events(id) });
    },
  });
}

export type { EnvelopeListItem };
