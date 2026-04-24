import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  useAcceptTermsMutation,
  useDeclineMutation,
  useFillFieldMutation,
  useSignMeQuery,
  useSignatureMutation,
  useSubmitMutation,
} from './useSigning';
import type {
  FillValue,
  SignMeEnvelope,
  SignMeField,
  SignMeOtherSigner,
  SignMeSigner,
  SignatureInput,
} from './signingApi';

export interface SigningSessionValue {
  readonly loading: boolean;
  readonly error: Error | null;
  readonly envelope: SignMeEnvelope | null;
  readonly signer: SignMeSigner | null;
  readonly fields: ReadonlyArray<SignMeField>;
  readonly otherSigners: ReadonlyArray<SignMeOtherSigner>;
  readonly completedRequired: number;
  readonly requiredCount: number;
  readonly nextField: SignMeField | null;
  readonly allRequiredFilled: boolean;
  readonly fillField: (field_id: string, value: FillValue) => Promise<void>;
  readonly setSignature: (field_id: string, input: SignatureInput) => Promise<void>;
  readonly acceptTerms: () => Promise<void>;
  readonly submit: () => Promise<void>;
  readonly decline: (reason?: string) => Promise<void>;
}

const Ctx = createContext<SigningSessionValue | null>(null);

export interface SigningSessionProviderProps {
  readonly envelopeId: string;
  readonly senderName: string | null;
  readonly children: ReactNode;
}

function fieldIsFilled(f: SignMeField): boolean {
  if (f.kind === 'checkbox') return f.value_boolean === true;
  return Boolean(f.value_text);
}

export function SigningSessionProvider(props: SigningSessionProviderProps) {
  const { envelopeId, senderName, children } = props;

  const q = useSignMeQuery(envelopeId, true);
  const fill = useFillFieldMutation(envelopeId);
  const sig = useSignatureMutation(envelopeId);
  const terms = useAcceptTermsMutation(envelopeId);
  const submitMut = useSubmitMutation(envelopeId, { senderName });
  const declineMut = useDeclineMutation(envelopeId, { senderName });

  const value = useMemo<SigningSessionValue>(() => {
    const fields = q.data?.fields ?? [];
    const required = fields.filter((f) => f.required);
    const completed = required.filter(fieldIsFilled);
    const next = required.find((f) => !fieldIsFilled(f)) ?? null;

    return {
      loading: q.isPending,
      error: q.error ?? null,
      envelope: q.data?.envelope ?? null,
      signer: q.data?.signer ?? null,
      fields,
      otherSigners: q.data?.other_signers ?? [],
      requiredCount: required.length,
      completedRequired: completed.length,
      nextField: next,
      allRequiredFilled: required.length > 0 && next === null,
      fillField: async (field_id, val) => {
        await fill.mutateAsync({ field_id, value: val });
      },
      setSignature: async (field_id, input) => {
        await sig.mutateAsync({ field_id, input });
      },
      acceptTerms: async () => {
        await terms.mutateAsync();
      },
      submit: async () => {
        await submitMut.mutateAsync();
      },
      decline: async (reason) => {
        await declineMut.mutateAsync(reason);
      },
    };
  }, [q.data, q.isPending, q.error, fill, sig, terms, submitMut, declineMut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSigningSession(): SigningSessionValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useSigningSession must be called inside <SigningSessionProvider>');
  }
  return v;
}
