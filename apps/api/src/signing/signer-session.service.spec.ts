import type { AppEnv } from '../config/env.schema';
import { SignerSessionService, SignerSessionVerifyError } from './signer-session.service';

const TEST_SECRET = 'x'.repeat(64);
const TEST_ENV = {
  SIGNER_SESSION_SECRET: TEST_SECRET,
} as unknown as AppEnv;

describe('SignerSessionService', () => {
  let svc: SignerSessionService;

  beforeEach(() => {
    svc = new SignerSessionService(TEST_ENV);
  });

  describe('mint', () => {
    it('produces a three-part JWT string', async () => {
      const tok = await svc.mint({
        envelope_id: '11111111-1111-4111-8111-111111111111',
        signer_id: '22222222-2222-4222-8222-222222222222',
      });
      expect(tok.split('.')).toHaveLength(3);
    });

    it('distinct claims produce distinct tokens', async () => {
      const a = await svc.mint({
        envelope_id: '11111111-1111-4111-8111-111111111111',
        signer_id: '22222222-2222-4222-8222-222222222222',
      });
      const b = await svc.mint({
        envelope_id: '11111111-1111-4111-8111-111111111111',
        signer_id: '33333333-3333-4333-8333-333333333333',
      });
      expect(a).not.toBe(b);
    });
  });

  describe('verify', () => {
    it('round-trips the claims', async () => {
      const claims = {
        envelope_id: '11111111-1111-4111-8111-111111111111',
        signer_id: '22222222-2222-4222-8222-222222222222',
      };
      const tok = await svc.mint(claims);
      const out = await svc.verify(tok);
      expect(out).toEqual(claims);
    });

    it('rejects a token signed with a different secret', async () => {
      const foreignSvc = new SignerSessionService({
        SIGNER_SESSION_SECRET: 'y'.repeat(64),
      } as unknown as AppEnv);
      const foreignTok = await foreignSvc.mint({
        envelope_id: '11111111-1111-4111-8111-111111111111',
        signer_id: '22222222-2222-4222-8222-222222222222',
      });
      await expect(svc.verify(foreignTok)).rejects.toMatchObject({
        constructor: SignerSessionVerifyError,
        reason: 'invalid',
      });
    });

    it('rejects a malformed JWT as invalid', async () => {
      await expect(svc.verify('not.a.jwt')).rejects.toMatchObject({
        constructor: SignerSessionVerifyError,
        reason: 'invalid',
      });
    });
  });

  describe('secret required', () => {
    it('mint throws when SIGNER_SESSION_SECRET is absent', async () => {
      const blankSvc = new SignerSessionService({} as unknown as AppEnv);
      await expect(
        blankSvc.mint({
          envelope_id: '11111111-1111-4111-8111-111111111111',
          signer_id: '22222222-2222-4222-8222-222222222222',
        }),
      ).rejects.toThrow(/SIGNER_SESSION_SECRET/);
    });

    it('verify throws when SIGNER_SESSION_SECRET is absent', async () => {
      const tok = await svc.mint({
        envelope_id: '11111111-1111-4111-8111-111111111111',
        signer_id: '22222222-2222-4222-8222-222222222222',
      });
      const blankSvc = new SignerSessionService({} as unknown as AppEnv);
      await expect(blankSvc.verify(tok)).rejects.toThrow(/SIGNER_SESSION_SECRET/);
    });
  });

  describe('cookieMaxAgeSeconds', () => {
    it('exposes the 30-minute default', () => {
      expect(svc.cookieMaxAgeSeconds).toBe(30 * 60);
    });
  });
});
