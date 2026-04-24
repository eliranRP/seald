import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './signingApi';
import type {
  DeclineResponse,
  FillValue,
  SignMeField,
  SignMeResponse,
  SignMeSigner,
  SignatureInput,
  StartSessionInput,
  StartSessionResponse,
  SubmitResponse,
} from './signingApi';
import { writeDoneSnapshot } from './doneSnapshot';
import { reportSignerEvent } from './telemetry';

export const SIGN_ME_KEY = (envelopeId: string): readonly [string, string, string] =>
  ['sign', 'me', envelopeId] as const;

/**
 * Single source of truth for the signer session. Pass `enabled=false` to
 * hold off until the envelope id is parsed from the URL.
 */
export function useSignMeQuery(envelopeId: string, enabled: boolean) {
  return useQuery<SignMeResponse>({
    queryKey: SIGN_ME_KEY(envelopeId),
    queryFn: ({ signal }) => api.getMe(signal),
    enabled: enabled && Boolean(envelopeId),
    retry: 1,
  });
}

export function useStartSessionMutation() {
  return useMutation<StartSessionResponse, Error, StartSessionInput>({
    mutationFn: (input) => api.startSession(input),
    onSuccess: (_, input) => {
      reportSignerEvent({ type: 'sign.session.started', envelope_id: input.envelope_id });
    },
  });
}

export function useAcceptTermsMutation(envelopeId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, void, { readonly previous: SignMeResponse | undefined }>({
    mutationFn: () => api.acceptTerms(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: SIGN_ME_KEY(envelopeId) });
      const previous = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      if (previous) {
        qc.setQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId), {
          ...previous,
          signer: { ...previous.signer, tc_accepted_at: new Date().toISOString() },
        });
      }
      return { previous };
    },
    onSuccess: () => {
      reportSignerEvent({ type: 'sign.tc.accepted', envelope_id: envelopeId });
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(SIGN_ME_KEY(envelopeId), ctx.previous);
    },
  });
}

export interface FillFieldArgs {
  readonly field_id: string;
  readonly value: FillValue;
}

export function useFillFieldMutation(envelopeId: string) {
  const qc = useQueryClient();
  return useMutation<
    SignMeField,
    Error,
    FillFieldArgs,
    { readonly previous: SignMeResponse | undefined }
  >({
    mutationFn: ({ field_id, value }) => api.fillField(field_id, value),
    onMutate: async ({ field_id, value }) => {
      await qc.cancelQueries({ queryKey: SIGN_ME_KEY(envelopeId) });
      const previous = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      if (previous) {
        qc.setQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId), {
          ...previous,
          fields: previous.fields.map((f) =>
            f.id === field_id
              ? {
                  ...f,
                  value_text: 'value_text' in value ? value.value_text : (f.value_text ?? null),
                  value_boolean:
                    'value_boolean' in value ? value.value_boolean : (f.value_boolean ?? null),
                  filled_at: new Date().toISOString(),
                }
              : f,
          ),
        });
      }
      return { previous };
    },
    onSuccess: (saved, args) => {
      const current = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      if (current) {
        qc.setQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId), {
          ...current,
          fields: current.fields.map((f) => (f.id === saved.id ? saved : f)),
        });
      }
      reportSignerEvent({
        type: 'sign.field.filled',
        envelope_id: envelopeId,
        field_id: args.field_id,
        kind: saved.kind,
      });
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.previous) qc.setQueryData(SIGN_ME_KEY(envelopeId), ctx.previous);
    },
  });
}

export interface SignatureMutationArgs {
  readonly field_id: string;
  readonly input: SignatureInput;
}

export function useSignatureMutation(envelopeId: string) {
  const qc = useQueryClient();
  return useMutation<
    SignMeSigner,
    Error,
    SignatureMutationArgs,
    { readonly previous: SignMeResponse | undefined; readonly previewUrl: string | null }
  >({
    mutationFn: ({ input }) => api.uploadSignature(input),
    onMutate: async ({ field_id, input }) => {
      await qc.cancelQueries({ queryKey: SIGN_ME_KEY(envelopeId) });
      const previous = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      let previewUrl: string | null = null;
      if (previous && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        previewUrl = URL.createObjectURL(input.blob);
        qc.setQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId), {
          ...previous,
          fields: previous.fields.map((f) =>
            f.id === field_id
              ? { ...f, value_text: previewUrl, filled_at: new Date().toISOString() }
              : f,
          ),
        });
      }
      return { previous, previewUrl };
    },
    onSuccess: (updatedSigner, args) => {
      const current = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      if (current) {
        qc.setQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId), {
          ...current,
          signer: updatedSigner,
        });
      }
      reportSignerEvent({
        type: 'sign.signature.uploaded',
        envelope_id: envelopeId,
        field_id: args.field_id,
        format: args.input.format,
      });
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.previous) qc.setQueryData(SIGN_ME_KEY(envelopeId), ctx.previous);
      if (
        ctx?.previewUrl &&
        typeof URL !== 'undefined' &&
        typeof URL.revokeObjectURL === 'function'
      ) {
        URL.revokeObjectURL(ctx.previewUrl);
      }
    },
  });
}

export interface TerminalMutationOptions {
  readonly senderName: string | null;
}

export function useSubmitMutation(envelopeId: string, opts: TerminalMutationOptions) {
  const qc = useQueryClient();
  return useMutation<SubmitResponse, Error, void>({
    mutationFn: () => api.submit(),
    onSuccess: () => {
      const me = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      writeDoneSnapshot({
        kind: 'submitted',
        envelope_id: envelopeId,
        title: me?.envelope.title ?? '',
        sender_name: opts.senderName,
        recipient_email: me?.signer.email ?? '',
        timestamp: new Date().toISOString(),
      });
      qc.removeQueries({ queryKey: SIGN_ME_KEY(envelopeId) });
      reportSignerEvent({ type: 'sign.submitted', envelope_id: envelopeId });
    },
  });
}

export function useDeclineMutation(envelopeId: string, opts: TerminalMutationOptions) {
  const qc = useQueryClient();
  return useMutation<DeclineResponse, Error, string | undefined>({
    mutationFn: (reason) => api.decline(reason),
    onSuccess: () => {
      const me = qc.getQueryData<SignMeResponse>(SIGN_ME_KEY(envelopeId));
      writeDoneSnapshot({
        kind: 'declined',
        envelope_id: envelopeId,
        title: me?.envelope.title ?? '',
        sender_name: opts.senderName,
        recipient_email: me?.signer.email ?? '',
        timestamp: new Date().toISOString(),
      });
      qc.removeQueries({ queryKey: SIGN_ME_KEY(envelopeId) });
      reportSignerEvent({ type: 'sign.declined', envelope_id: envelopeId });
    },
  });
}
