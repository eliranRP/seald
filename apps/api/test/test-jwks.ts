import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { createLocalJWKSet, type JSONWebKeySet } from 'jose';

export interface TestJwks {
  jwks: JSONWebKeySet;
  resolver: ReturnType<typeof createLocalJWKSet>;
  sign: (payload: Record<string, unknown>, options?: SignOptions) => Promise<string>;
}

interface SignOptions {
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  kid?: string;
}

export async function buildTestJwks(): Promise<TestJwks> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk: JWK = await exportJWK(publicKey);
  const kid = 'test-key-1';
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  const jwks: JSONWebKeySet = { keys: [publicJwk] };
  const resolver = createLocalJWKSet(jwks);

  async function sign(
    payload: Record<string, unknown>,
    options: SignOptions = {},
  ): Promise<string> {
    const jwt = new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? kid })
      .setIssuedAt();
    if (options.issuer) jwt.setIssuer(options.issuer);
    if (options.audience) jwt.setAudience(options.audience);
    jwt.setExpirationTime(options.expiresIn ?? '1h');
    return jwt.sign(privateKey);
  }

  return { jwks, resolver, sign };
}
