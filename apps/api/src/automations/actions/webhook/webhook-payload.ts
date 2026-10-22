import type { AutomationTrigger } from 'shared';

/**
 * Webhook body, `seald.automation.v1` (design doc § Payload). Built from an
 * explicit allowlist of fields: never signing tokens, sign URLs, storage
 * paths, PDF bytes, the webhook URL or secret, API keys or Drive tokens.
 */

export const WEBHOOK_PAYLOAD_VERSION = 'seald.automation.v1';
export const WEBHOOK_USER_AGENT = 'Seald-Automations';

export type WebhookEventType =
  | 'envelope.sealed'
  | 'envelope.sent'
  | 'signer.signed'
  | 'signer.declined'
  | 'envelope.expired'
  | 'envelope.viewed';

export const WEBHOOK_EVENT_TYPE_BY_TRIGGER: Readonly<Record<AutomationTrigger, WebhookEventType>> =
  {
    envelope_sealed: 'envelope.sealed',
    envelope_sent: 'envelope.sent',
    signer_signed: 'signer.signed',
    signer_declined: 'signer.declined',
    envelope_expired: 'envelope.expired',
    envelope_viewed: 'envelope.viewed',
  };

export type PayloadDetail = 'ids' | 'with_signer';

/** `config.payload_detail`; anything but `with_signer` is the default `ids`. */
export function payloadDetailFrom(config: Record<string, unknown>): PayloadDetail {
  return config.payload_detail === 'with_signer' ? 'with_signer' : 'ids';
}

export interface WebhookPayloadSource {
  readonly runId: string;
  readonly trigger: AutomationTrigger;
  readonly eventCreatedAt: string;
  readonly envelope: {
    readonly id: string;
    readonly title: string;
    readonly status: string;
    readonly shortCode: string;
  };
  readonly signer: { readonly id: string; readonly name: string; readonly email: string } | null;
}

export interface WebhookPayload {
  readonly version: typeof WEBHOOK_PAYLOAD_VERSION;
  readonly id: string;
  readonly type: WebhookEventType;
  readonly created_at: string;
  readonly data: {
    readonly envelope_id: string;
    readonly status: string;
    readonly verify_url: string;
    readonly title?: string;
    readonly short_code?: string;
    readonly signer?: { readonly id: string; readonly name: string; readonly email: string };
  };
}

export function verifyUrl(appPublicUrl: string, shortCode: string): string {
  return `${appPublicUrl.replace(/\/+$/, '')}/verify/${encodeURIComponent(shortCode)}`;
}

export function buildWebhookPayload(
  source: WebhookPayloadSource,
  detail: PayloadDetail,
  appPublicUrl: string,
): WebhookPayload {
  const base = {
    envelope_id: source.envelope.id,
    status: source.envelope.status,
    verify_url: verifyUrl(appPublicUrl, source.envelope.shortCode),
  };
  const data =
    detail === 'with_signer'
      ? {
          ...base,
          title: source.envelope.title,
          short_code: source.envelope.shortCode,
          ...(source.signer
            ? {
                signer: {
                  id: source.signer.id,
                  name: source.signer.name,
                  email: source.signer.email,
                },
              }
            : {}),
        }
      : base;
  return {
    version: WEBHOOK_PAYLOAD_VERSION,
    id: source.runId,
    type: WEBHOOK_EVENT_TYPE_BY_TRIGGER[source.trigger],
    created_at: source.eventCreatedAt,
    data,
  };
}
