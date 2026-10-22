import { createHmac } from 'node:crypto';
import {
  EVENT_ID_HEADER,
  PREVIOUS_SIGNATURE_HEADER,
  SIGNATURE_HEADER,
  signPayload,
  signatureHeaderValue,
  signatureHeaders,
  verifySignatureHeader,
} from '../webhook-signature';

const T = 1_700_000_000;
const BODY = '{"version":"seald.automation.v1","id":"run_1"}';
const CURRENT = 'seald_webhook_test_vector_secret';
const PREVIOUS = 'seald_webhook_previous_vector';

describe('webhook signature', () => {
  it('HMAC-SHA256 primitive matches RFC 4231 test case 2', () => {
    expect(createHmac('sha256', 'Jefe').update('what do ya want for nothing?').digest('hex')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('signs `${t}.${rawBody}` (vector computed independently with openssl dgst)', () => {
    // printf '%s' '1700000000.<body>' | openssl dgst -sha256 -hmac '<secret>' -hex
    expect(signPayload(CURRENT, T, BODY)).toBe(
      '49903753f947dc7424b3bde33f2e64fc8e6889d75cda39d14bb4994b94687a2c',
    );
    expect(signatureHeaderValue(CURRENT, T, BODY)).toBe(
      't=1700000000,v1=49903753f947dc7424b3bde33f2e64fc8e6889d75cda39d14bb4994b94687a2c',
    );
  });

  it('sends only the current signature and the event id outside a rotation window', () => {
    const h = signatureHeaders({
      secret: CURRENT,
      runId: 'run_1',
      timestampSeconds: T,
      rawBody: BODY,
    });
    expect(Object.keys(h).sort()).toEqual([EVENT_ID_HEADER, SIGNATURE_HEADER].sort());
    expect(h[EVENT_ID_HEADER]).toBe('run_1');
  });

  it('sends both signatures during rotation, each verifying with its own secret', () => {
    const h = signatureHeaders({
      secret: CURRENT,
      previousSecret: PREVIOUS,
      runId: 'run_1',
      timestampSeconds: T,
      rawBody: BODY,
    });
    expect(h[PREVIOUS_SIGNATURE_HEADER]).toBeDefined();
    const now = T + 10;
    expect(
      verifySignatureHeader({
        header: h[SIGNATURE_HEADER],
        rawBody: BODY,
        secret: CURRENT,
        nowSeconds: now,
      }).ok,
    ).toBe(true);
    expect(
      verifySignatureHeader({
        header: h[PREVIOUS_SIGNATURE_HEADER],
        rawBody: BODY,
        secret: PREVIOUS,
        nowSeconds: now,
      }).ok,
    ).toBe(true);
    // Cross-checks fail: the previous header is not the current secret.
    expect(
      verifySignatureHeader({
        header: h[PREVIOUS_SIGNATURE_HEADER],
        rawBody: BODY,
        secret: CURRENT,
        nowSeconds: now,
      }),
    ).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  describe('reference verify snippet', () => {
    const header = signatureHeaderValue(CURRENT, T, BODY);

    it.each([0, 299, 300, -300])('accepts t within the 300 s window (skew %i s)', (skew) => {
      expect(
        verifySignatureHeader({ header, rawBody: BODY, secret: CURRENT, nowSeconds: T + skew }),
      ).toEqual({ ok: true, timestamp: T });
    });

    it.each([301, -301, 3600])('rejects a replay outside the window (skew %i s)', (skew) => {
      expect(
        verifySignatureHeader({ header, rawBody: BODY, secret: CURRENT, nowSeconds: T + skew }),
      ).toEqual({ ok: false, reason: 'timestamp_outside_window' });
    });

    it('rejects a different length before the constant-time compare', () => {
      const short = header.slice(0, -2);
      expect(
        verifySignatureHeader({ header: short, rawBody: BODY, secret: CURRENT, nowSeconds: T }),
      ).toEqual({ ok: false, reason: 'signature_mismatch' });
    });

    it('rejects a tampered body and a wrong secret', () => {
      expect(
        verifySignatureHeader({ header, rawBody: `${BODY} `, secret: CURRENT, nowSeconds: T }).ok,
      ).toBe(false);
      expect(
        verifySignatureHeader({ header, rawBody: BODY, secret: PREVIOUS, nowSeconds: T }).ok,
      ).toBe(false);
    });

    it('rejects a re-stamped timestamp on a captured signature', () => {
      const v1 = header.split('v1=')[1];
      expect(
        verifySignatureHeader({
          header: `t=${T + 100},v1=${v1}`,
          rawBody: BODY,
          secret: CURRENT,
          nowSeconds: T + 100,
        }),
      ).toEqual({ ok: false, reason: 'signature_mismatch' });
    });

    it.each([undefined, '', 'v1=abc', 't=abc,v1=00', `t=${T},v1=ZZ`, `t=${T}`])(
      'fails closed on a malformed header %p',
      (h) => {
        expect(
          verifySignatureHeader({ header: h, rawBody: BODY, secret: CURRENT, nowSeconds: T }),
        ).toEqual({ ok: false, reason: 'malformed' });
      },
    );
  });
});
