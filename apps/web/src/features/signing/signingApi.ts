import type { AxiosRequestConfig } from 'axios';
import type { AnyFieldKind, FieldMetaOptions } from 'shared';
import { signApiClient } from '@/lib/api/signApiClient';

/* ---------------- Wire-level types (mirror the Nest responses) ---------------- */

export type SignerRole = 'proposer' | 'signatory' | 'validator' | 'witness';
export type SignerUiStatus = 'awaiting' | 'viewing' | 'completed' | 'declined';
/** Every kind the API knows; the four new ones only while `fieldMetaV2` is on (WP-07). */
export type FieldKind = AnyFieldKind;
export type SignatureFormat = 'drawn' | 'typed' | 'upload';

export interface SignMeEnvelope {
  readonly id: string;
  readonly title: string;
  readonly short_code: string;
  readonly status: string;
  readonly original_pages: number | null;
  readonly expires_at: string;
  readonly tc_version: string;
  readonly privacy_version: string;
  /** How date fields render (WP-07). Present only while `fieldMetaV2` is on. */
  readonly date_format?: string | null;
  readonly timezone?: string | null;
  /** Envelope language (WP-38). Present only while `i18n` is on. */
  readonly locale?: string | null;
}
export interface SignMeSigner {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly color: string;
  readonly role: SignerRole;
  readonly status: SignerUiStatus;
  readonly viewed_at: string | null;
  readonly tc_accepted_at: string | null;
  readonly signed_at: string | null;
  readonly declined_at: string | null;
  /** This signer's language override (WP-38). Present only while `i18n` is on. */
  readonly locale?: string | null;
}
export interface SignMeField {
  readonly id: string;
  readonly signer_id: string;
  readonly kind: FieldKind;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly required: boolean;
  readonly link_id?: string | null;
  readonly value_text?: string | null;
  readonly value_boolean?: boolean | null;
  readonly filled_at?: string | null;
  /** Present only while `multiDocumentEnvelopes` is on (WP-03). `page` is 1-based within that document. */
  readonly document_id?: string;
  /** Per-kind options (WP-07). Present only while `fieldMetaV2` is on. */
  readonly meta?: FieldMetaOptions;
}
/** One PDF of the envelope, as the signer sees it (WP-03; no hashes or paths). */
export interface SignMeDocument {
  readonly id: string;
  readonly ord: number;
  readonly title: string;
  readonly original_pages: number | null;
}
export interface SignMeOtherSigner {
  readonly id: string;
  readonly status: SignerUiStatus;
  readonly name_masked: string;
}
export interface SignMeResponse {
  readonly envelope: SignMeEnvelope;
  readonly signer: SignMeSigner;
  readonly fields: ReadonlyArray<SignMeField>;
  readonly other_signers: ReadonlyArray<SignMeOtherSigner>;
  /** Present only while `multiDocumentEnvelopes` is on (WP-03). */
  readonly documents?: ReadonlyArray<SignMeDocument>;
}

export interface StartSessionInput {
  readonly envelope_id: string;
  readonly token: string;
}
export interface StartSessionResponse {
  readonly envelope_id: string;
  readonly signer_id: string;
  readonly requires_tc_accept: boolean;
}

/**
 * `POST /sign/start` when the sender asked for an emailed one-time code
 * (WP-10, flag `signerAccessAuth`). No session exists yet: the signer asks
 * for and enters the code first. Never returned while the flag is off.
 */
export interface StartSessionAccessCodeRequired {
  readonly status: 'access_code_required';
  readonly envelope_id: string;
  readonly signer_id: string;
  readonly email_masked: string;
}
export type StartSessionResult = StartSessionResponse | StartSessionAccessCodeRequired;

export function isAccessCodeRequired(r: StartSessionResult): r is StartSessionAccessCodeRequired {
  return 'status' in r && r.status === 'access_code_required';
}

export type FillValue = { readonly value_text: string } | { readonly value_boolean: boolean };

export type SignatureKind = 'signature' | 'initials';

export interface SignatureInput {
  readonly blob: Blob;
  readonly format: SignatureFormat;
  /**
   * Discriminates whether the upload is the signer's full signature or
   * just their initials. Server defaults to 'signature' when absent so
   * older clients still work; new code should always pass it explicitly
   * because both kinds otherwise share a storage path on the backend.
   */
  readonly kind?: SignatureKind;
  readonly font?: string;
  readonly stroke_count?: number;
  readonly source_filename?: string;
}

export interface SubmitResponse {
  readonly status: 'submitted';
  readonly envelope_status: string;
}
export interface DeclineResponse {
  readonly status: 'declined';
  readonly envelope_status: string;
}

/* ---------------- Wire functions ---------------- */

function configWithSignal(signal?: AbortSignal): AxiosRequestConfig {
  return signal ? { signal } : {};
}

export async function startSession(
  input: StartSessionInput,
  signal?: AbortSignal,
): Promise<StartSessionResult> {
  const { data } = await signApiClient.post<StartSessionResult>(
    '/sign/start',
    input,
    configWithSignal(signal),
  );
  return data;
}

export async function getMe(signal?: AbortSignal): Promise<SignMeResponse> {
  const { data } = await signApiClient.get<SignMeResponse>('/sign/me', configWithSignal(signal));
  return data;
}

export async function acceptTerms(signal?: AbortSignal): Promise<void> {
  await signApiClient.post('/sign/accept-terms', undefined, configWithSignal(signal));
}

/**
 * T-14 — record that the signer acknowledged the ESIGN Consumer
 * Disclosure and demonstrated the ability to access electronic
 * records on this device. The version string maps 1:1 to the copy
 * the signer saw and is preserved verbatim in the audit chain.
 */
export async function acknowledgeEsignDisclosure(
  disclosureVersion: string,
  signal?: AbortSignal,
): Promise<void> {
  await signApiClient.post(
    '/sign/esign-disclosure',
    { disclosure_version: disclosureVersion },
    configWithSignal(signal),
  );
}

/**
 * T-15 — record the signer's explicit intent-to-sign affirmation.
 * The act of POSTing is the affirmation; no body is sent.
 */
export async function confirmIntentToSign(signal?: AbortSignal): Promise<void> {
  await signApiClient.post('/sign/intent-to-sign', undefined, configWithSignal(signal));
}

/**
 * T-16 — record withdrawal of consent for electronic signing.
 * Server emits `consent_withdrawn` then funnels into the decline
 * pipeline so the envelope reaches a terminal state. Returns the
 * same shape as decline().
 */
export async function withdrawConsent(
  reason?: string,
  signal?: AbortSignal,
): Promise<DeclineResponse> {
  const body = reason !== undefined ? { reason } : undefined;
  const { data } = await signApiClient.post<DeclineResponse>(
    '/sign/withdraw-consent',
    body,
    configWithSignal(signal),
  );
  return data;
}

export async function fillField(
  fieldId: string,
  value: FillValue,
  signal?: AbortSignal,
): Promise<SignMeField> {
  const { data } = await signApiClient.post<SignMeField>(
    `/sign/fields/${fieldId}`,
    value,
    configWithSignal(signal),
  );
  return data;
}

export async function uploadSignature(
  input: SignatureInput,
  signal?: AbortSignal,
): Promise<SignMeSigner> {
  const fd = new FormData();
  fd.append('image', input.blob, input.source_filename ?? 'signature.png');
  fd.append('format', input.format);
  if (input.kind !== undefined) fd.append('kind', input.kind);
  if (input.font !== undefined) fd.append('font', input.font);
  if (input.stroke_count !== undefined) fd.append('stroke_count', String(input.stroke_count));
  if (input.source_filename !== undefined) fd.append('source_filename', input.source_filename);

  const config: AxiosRequestConfig = {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...(signal ? { signal } : {}),
  };
  const { data } = await signApiClient.post<SignMeSigner>('/sign/signature', fd, config);
  return data;
}

/**
 * `accessCode` is the fresh emailed code when the sender asked for a
 * re-check before signing (WP-10). Without it the request has no body, as
 * it always did.
 */
export async function submit(accessCode?: string, signal?: AbortSignal): Promise<SubmitResponse> {
  const { data } = await signApiClient.post<SubmitResponse>(
    '/sign/submit',
    accessCode !== undefined ? { access_code: accessCode } : undefined,
    configWithSignal(signal),
  );
  return data;
}

export async function decline(reason?: string, signal?: AbortSignal): Promise<DeclineResponse> {
  const body = reason !== undefined ? { reason } : undefined;
  const { data } = await signApiClient.post<DeclineResponse>(
    '/sign/decline',
    body,
    configWithSignal(signal),
  );
  return data;
}

/**
 * Fetch a fresh 90-second signed URL for the envelope's original PDF.
 * The caller should pass this straight to pdf.js's `getDocument` WITHOUT
 * `withCredentials`: the URL already encodes its own auth token, and
 * Supabase storage doesn't emit `Access-Control-Allow-Credentials`, so
 * an unnecessary credentials flag would trip browser CORS.
 */
export async function getPdfSignedUrl(signal?: AbortSignal, documentId?: string): Promise<string> {
  // `document_id` picks one document of a multi-document envelope (WP-03);
  // omitted, the API serves document 1 exactly as before.
  const config: AxiosRequestConfig =
    documentId !== undefined
      ? { ...configWithSignal(signal), params: { document_id: documentId } }
      : configWithSignal(signal);
  const { data } = await signApiClient.get<{ readonly url: string }>('/sign/pdf', config);
  return data.url;
}
