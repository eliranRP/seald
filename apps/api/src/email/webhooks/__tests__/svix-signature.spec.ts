import { createHmac } from 'node:crypto';
import { SVIX_TOLERANCE_SECONDS, verifySvixSignature } from '../svix-signature';

const KEY = Buffer.from('a-test-signing-key-of-some-length');
const SECRET = `whsec_${KEY.toString('base64')}`;
const NOW = 1_800_000_000;
const BODY = '{"type":"email.bounced","data":{"email_id":"abc"}}';

function sign(id: string, ts: number, body: string, key: Buffer = KEY): string {
  return createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
}

describe('verifySvixSignature', () => {
  it('accepts a correctly signed body', () => {
    const headers = {
      id: 'msg_1',
      timestamp: String(NOW),
      signature: `v1,${sign('msg_1', NOW, BODY)}`,
    };
    expect(verifySvixSignature(SECRET, BODY, headers, NOW)).toBe(true);
  });

  it('accepts when any of several space-separated signatures matches (secret rotation)', () => {
    const stale = sign('msg_1', NOW, BODY, Buffer.from('an-old-secret'));
    const headers = {
      id: 'msg_1',
      timestamp: String(NOW),
      signature: `v1,${stale} v1,${sign('msg_1', NOW, BODY)}`,
    };
    expect(verifySvixSignature(SECRET, BODY, headers, NOW)).toBe(true);
  });

  it('rejects a body that changed after signing', () => {
    const headers = {
      id: 'msg_1',
      timestamp: String(NOW),
      signature: `v1,${sign('msg_1', NOW, BODY)}`,
    };
    expect(verifySvixSignature(SECRET, `${BODY} `, headers, NOW)).toBe(false);
  });

  it('rejects another id, another secret, a bad version tag and a garbled value', () => {
    const good = sign('msg_1', NOW, BODY);
    expect(
      verifySvixSignature(
        SECRET,
        BODY,
        { id: 'msg_2', timestamp: String(NOW), signature: `v1,${good}` },
        NOW,
      ),
    ).toBe(false);
    expect(
      verifySvixSignature(
        `whsec_${Buffer.from('another-secret').toString('base64')}`,
        BODY,
        { id: 'msg_1', timestamp: String(NOW), signature: `v1,${good}` },
        NOW,
      ),
    ).toBe(false);
    expect(
      verifySvixSignature(
        SECRET,
        BODY,
        { id: 'msg_1', timestamp: String(NOW), signature: `v2,${good}` },
        NOW,
      ),
    ).toBe(false);
    expect(
      verifySvixSignature(
        SECRET,
        BODY,
        { id: 'msg_1', timestamp: String(NOW), signature: 'v1,!!' },
        NOW,
      ),
    ).toBe(false);
  });

  it('rejects a missing header', () => {
    const signature = `v1,${sign('msg_1', NOW, BODY)}`;
    expect(
      verifySvixSignature(SECRET, BODY, { id: undefined, timestamp: String(NOW), signature }, NOW),
    ).toBe(false);
    expect(
      verifySvixSignature(SECRET, BODY, { id: 'msg_1', timestamp: undefined, signature }, NOW),
    ).toBe(false);
    expect(
      verifySvixSignature(
        SECRET,
        BODY,
        { id: 'msg_1', timestamp: String(NOW), signature: undefined },
        NOW,
      ),
    ).toBe(false);
  });

  it('rejects a timestamp outside the five-minute window, in either direction', () => {
    const old = NOW - SVIX_TOLERANCE_SECONDS - 1;
    const future = NOW + SVIX_TOLERANCE_SECONDS + 1;
    for (const ts of [old, future]) {
      const headers = {
        id: 'msg_1',
        timestamp: String(ts),
        signature: `v1,${sign('msg_1', ts, BODY)}`,
      };
      expect(verifySvixSignature(SECRET, BODY, headers, NOW)).toBe(false);
    }
    const edge = NOW - SVIX_TOLERANCE_SECONDS;
    expect(
      verifySvixSignature(
        SECRET,
        BODY,
        { id: 'msg_1', timestamp: String(edge), signature: `v1,${sign('msg_1', edge, BODY)}` },
        NOW,
      ),
    ).toBe(true);
  });

  it('rejects a non-numeric timestamp', () => {
    expect(
      verifySvixSignature(
        SECRET,
        BODY,
        { id: 'msg_1', timestamp: 'soon', signature: 'v1,abc' },
        NOW,
      ),
    ).toBe(false);
  });
});
