import type { AppEnv } from '../config/env.schema';
import { EmailSendError, type EmailMessage } from './email-sender';
import { ResendEmailSender } from './resend-email-sender';

/**
 * Coverage for the Resend HTTP adapter — provider-edge contract:
 *   - construction must throw without an API key
 *   - 2xx + provider id → success
 *   - 4xx → permanent EmailSendError (transient=false)
 *   - 429 + 5xx → transient EmailSendError (transient=true) so the
 *     dispatcher retries with backoff
 *   - 2xx but missing `id` → transient 502 (provider misbehaved; retry)
 *   - AbortSignal.timeout firing → transient 504 (don't blow the worker)
 *   - non-timeout fetch throw rethrows verbatim
 *   - `Idempotency-Key` is set so worker retries dedupe at the provider
 *
 * `fetch` is monkey-patched per test instead of via a constructor seam
 * because the SUT calls the global directly (rule: mock at the
 * boundary; here the boundary is the global fetch).
 */
const baseEnv = {
  EMAIL_FROM_ADDRESS: 'no-reply@seald.test',
  EMAIL_FROM_NAME: 'Seald Test',
  RESEND_API_KEY: 'rk_test_abc',
} as unknown as AppEnv;

function makeMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    to: { email: 'maya@example.com', name: 'Maya' },
    from: { email: 'no-reply@seald.test', name: 'Seald' },
    subject: 'Sign please',
    html: '<p>Hi</p>',
    text: 'Hi',
    idempotencyKey: 'idem-abc-123',
    headers: { 'X-Seald-Kind': 'invite' },
    ...overrides,
  };
}

describe('ResendEmailSender', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('throws at construction when RESEND_API_KEY is missing', () => {
    const env = { ...baseEnv, RESEND_API_KEY: undefined } as unknown as AppEnv;
    expect(() => new ResendEmailSender(env)).toThrow(/RESEND_API_KEY required/);
  });

  it('returns providerId on a 2xx response with id', async () => {
    const calls: Array<[string, RequestInit]> = [];
    global.fetch = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ id: 'prv_resend_42' }), { status: 200 });
    }) as unknown as typeof fetch;
    const sender = new ResendEmailSender(baseEnv);
    const out = await sender.send(makeMessage());
    expect(out).toEqual({ providerId: 'prv_resend_42' });

    // Sanity-check the request shape — auth header, idempotency, JSON
    // body. We don't go beyond top-level fields because the contract is
    // intentionally narrow (rule 3: behavior, not implementation).
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer rk_test_abc');
    expect(headers['Idempotency-Key']).toBe('idem-abc-123');
    const body = JSON.parse(init.body as string);
    expect(body.subject).toBe('Sign please');
    expect(body.from).toBe('Seald <no-reply@seald.test>');
    expect(body.to).toBe('Maya <maya@example.com>');
  });

  it('throws transient EmailSendError on 5xx so the worker retries', async () => {
    global.fetch = (async () =>
      new Response('upstream is down', { status: 502 })) as unknown as typeof fetch;
    const sender = new ResendEmailSender(baseEnv);
    await expect(sender.send(makeMessage())).rejects.toMatchObject({
      name: 'EmailSendError',
      provider: 'resend',
      status: 502,
      transient: true,
    });
  });

  it('throws transient EmailSendError on 429 (rate limited)', async () => {
    global.fetch = (async () =>
      new Response('rate_limited', { status: 429 })) as unknown as typeof fetch;
    const sender = new ResendEmailSender(baseEnv);
    await expect(sender.send(makeMessage())).rejects.toMatchObject({
      status: 429,
      transient: true,
    });
  });

  it('throws permanent EmailSendError on 400 (bad address)', async () => {
    // 4xx other than 429 → don't retry, the row is poisoned.
    global.fetch = (async () =>
      new Response('invalid_to', { status: 400 })) as unknown as typeof fetch;
    const sender = new ResendEmailSender(baseEnv);
    await expect(sender.send(makeMessage())).rejects.toMatchObject({
      status: 400,
      transient: false,
    });
  });

  it('throws transient 502 when 2xx body is missing the id field', async () => {
    // Resend SHOULD always return an id; if they don't, treat as a
    // provider blip and retry.
    global.fetch = (async () =>
      new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;
    const sender = new ResendEmailSender(baseEnv);
    await expect(sender.send(makeMessage())).rejects.toMatchObject({
      status: 502,
      transient: true,
    });
  });

  it('translates AbortSignal.timeout into transient 504 EmailSendError', async () => {
    global.fetch = (async () => {
      const err = new Error('timed out');
      err.name = 'TimeoutError';
      throw err;
    }) as unknown as typeof fetch;
    const sender = new ResendEmailSender(baseEnv);
    await expect(sender.send(makeMessage())).rejects.toMatchObject({
      name: 'EmailSendError',
      status: 504,
      transient: true,
    });
  });

  it('translates AbortError the same way as TimeoutError', async () => {
    global.fetch = (async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }) as unknown as typeof fetch;
    const sender = new ResendEmailSender(baseEnv);
    await expect(sender.send(makeMessage())).rejects.toBeInstanceOf(EmailSendError);
  });

  it('rethrows non-timeout fetch errors verbatim (e.g. DNS / network)', async () => {
    const boom = new Error('ENOTFOUND api.resend.com');
    global.fetch = (async () => {
      throw boom;
    }) as unknown as typeof fetch;
    const sender = new ResendEmailSender(baseEnv);
    await expect(sender.send(makeMessage())).rejects.toBe(boom);
  });
});
