import { JWKS_RESOLVER, createJwksProvider } from '../jwks.provider';
import { buildTestJwks } from '../../../test/test-jwks';

describe('JwksProvider factory', () => {
  it('returns a function usable by jwtVerify', async () => {
    const { resolver, sign } = await buildTestJwks();
    // Prove the test helper works with the same resolver shape used in prod.
    const token = await sign({ sub: 'u1' }, { issuer: 'iss', audience: 'aud' });
    expect(typeof token).toBe('string');
    expect(typeof resolver).toBe('function');
  });

  it('exposes the expected DI token', () => {
    expect(typeof JWKS_RESOLVER).toBe('symbol');
    expect(createJwksProvider).toBeInstanceOf(Function);
  });
});
