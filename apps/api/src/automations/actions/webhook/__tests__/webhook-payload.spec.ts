import { AUTOMATION_TRIGGERS } from 'shared';
import {
  WEBHOOK_PAYLOAD_VERSION,
  buildWebhookPayload,
  payloadDetailFrom,
  type WebhookPayloadSource,
} from '../webhook-payload';

const SOURCE: Omit<WebhookPayloadSource, 'trigger'> = {
  runId: 'run-1',
  eventCreatedAt: '2026-10-22T10:00:00.000Z',
  envelope: { id: 'env-1', title: 'Lease', status: 'completed', shortCode: 'AB12CD34EF56G' },
  signer: { id: 'sig-1', name: 'Ada', email: 'ada@example.com' },
};

function keysDeep(v: unknown, out: string[] = []): string[] {
  if (v && typeof v === 'object') {
    for (const [k, inner] of Object.entries(v)) {
      out.push(k);
      keysDeep(inner, out);
    }
  }
  return out;
}

describe('webhook payload', () => {
  it('defaults to ids only', () => {
    expect(payloadDetailFrom({})).toBe('ids');
    expect(payloadDetailFrom({ payload_detail: 'nonsense' })).toBe('ids');
    expect(payloadDetailFrom({ payload_detail: 'with_signer' })).toBe('with_signer');
  });

  it('ids shape: envelope_id, status and verify_url only', () => {
    const p = buildWebhookPayload(
      { ...SOURCE, trigger: 'envelope_sealed' },
      'ids',
      'https://seald.nromomentum.com/',
    );
    expect(p).toEqual({
      version: WEBHOOK_PAYLOAD_VERSION,
      id: 'run-1',
      type: 'envelope.sealed',
      created_at: '2026-10-22T10:00:00.000Z',
      data: {
        envelope_id: 'env-1',
        status: 'completed',
        verify_url: 'https://seald.nromomentum.com/verify/AB12CD34EF56G',
      },
    });
  });

  it('with_signer adds title, short_code and the signer', () => {
    const p = buildWebhookPayload(
      { ...SOURCE, trigger: 'signer_signed' },
      'with_signer',
      'https://seald.nromomentum.com',
    );
    expect(p.type).toBe('signer.signed');
    expect(p.data).toEqual({
      envelope_id: 'env-1',
      status: 'completed',
      verify_url: 'https://seald.nromomentum.com/verify/AB12CD34EF56G',
      title: 'Lease',
      short_code: 'AB12CD34EF56G',
      signer: { id: 'sig-1', name: 'Ada', email: 'ada@example.com' },
    });
  });

  it('omits signer when the event has none', () => {
    const p = buildWebhookPayload(
      { ...SOURCE, signer: null, trigger: 'envelope_sealed' },
      'with_signer',
      'https://x.test',
    );
    expect(p.data).not.toHaveProperty('signer');
  });

  it.each(AUTOMATION_TRIGGERS.flatMap((t) => [[t, 'ids'] as const, [t, 'with_signer'] as const]))(
    '%s / %s has no token-shaped key',
    (trigger, detail) => {
      const p = buildWebhookPayload({ ...SOURCE, trigger }, detail, 'https://x.test');
      expect(p.type).toMatch(/^(envelope|signer)\.(sealed|sent|signed|declined|expired|viewed)$/);
      for (const k of keysDeep(p))
        expect(k).not.toMatch(/token|sign_url|access_token|secret|url_ciphertext|path/i);
    },
  );
});
