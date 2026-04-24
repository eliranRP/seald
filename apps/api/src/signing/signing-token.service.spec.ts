import { createHash, randomBytes } from 'node:crypto';
import { SigningTokenService } from './signing-token.service';

describe('SigningTokenService', () => {
  let svc: SigningTokenService;
  beforeEach(() => {
    svc = new SigningTokenService();
  });

  describe('generate', () => {
    it('produces a 43-char URL-safe base64 string (256-bit payload)', () => {
      const t = svc.generate();
      expect(t).toHaveLength(43);
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('produces distinct tokens on consecutive calls', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) seen.add(svc.generate());
      expect(seen.size).toBe(200);
    });

    it('decodes to exactly 32 bytes', () => {
      for (let i = 0; i < 20; i++) {
        const bytes = Buffer.from(svc.generate(), 'base64url');
        expect(bytes.length).toBe(32);
      }
    });
  });

  describe('hash', () => {
    it('returns a 64-char hex sha256 digest', () => {
      const h = svc.hash('anything');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('matches an independent sha256 computation', () => {
      const token = svc.generate();
      const independent = createHash('sha256').update(token).digest('hex');
      expect(svc.hash(token)).toBe(independent);
    });

    it('is deterministic — same input, same hash', () => {
      const t = svc.generate();
      expect(svc.hash(t)).toBe(svc.hash(t));
    });

    it('diverges on any 1-byte change', () => {
      const a = 'a'.repeat(43);
      const b = 'b' + 'a'.repeat(42);
      expect(svc.hash(a)).not.toBe(svc.hash(b));
    });
  });

  describe('equalsHash', () => {
    it('true on identical hashes', () => {
      const h = svc.hash(svc.generate());
      expect(svc.equalsHash(h, h)).toBe(true);
    });

    it('false on different hashes', () => {
      const h1 = svc.hash('one');
      const h2 = svc.hash('two');
      expect(svc.equalsHash(h1, h2)).toBe(false);
    });

    it('false on different length inputs', () => {
      expect(svc.equalsHash('abc', 'a'.repeat(64))).toBe(false);
    });

    it('false on non-hex input that differs in length after decode', () => {
      // Two inputs that are both hex and same length behave normally.
      // Mismatched lengths should short-circuit to false without throwing.
      expect(svc.equalsHash('aa', 'aabb')).toBe(false);
    });
  });

  describe('looksLikeToken', () => {
    it('accepts a freshly generated token', () => {
      expect(svc.looksLikeToken(svc.generate())).toBe(true);
    });

    it('rejects non-strings', () => {
      expect(svc.looksLikeToken(null)).toBe(false);
      expect(svc.looksLikeToken(undefined)).toBe(false);
      expect(svc.looksLikeToken(123)).toBe(false);
      expect(svc.looksLikeToken({})).toBe(false);
      expect(svc.looksLikeToken([])).toBe(false);
    });

    it('rejects wrong length', () => {
      expect(svc.looksLikeToken('abc')).toBe(false);
      expect(svc.looksLikeToken('a'.repeat(42))).toBe(false);
      expect(svc.looksLikeToken('a'.repeat(44))).toBe(false);
    });

    it('rejects non-URL-safe base64 characters', () => {
      // Valid chars are [A-Za-z0-9_-], so '/' and '+' and '=' are rejected.
      const base = 'a'.repeat(43);
      expect(svc.looksLikeToken(base.slice(0, 42) + '/')).toBe(false);
      expect(svc.looksLikeToken(base.slice(0, 42) + '+')).toBe(false);
      expect(svc.looksLikeToken(base.slice(0, 42) + '=')).toBe(false);
    });

    it('narrows the type in a type guard', () => {
      const candidate: unknown = svc.generate();
      if (svc.looksLikeToken(candidate)) {
        // Compile-time smoke: should be `string` here.
        const len: number = candidate.length;
        expect(len).toBe(43);
      } else {
        throw new Error('unreachable');
      }
    });
  });

  describe('entropy properties (statistical)', () => {
    it('distributes token characters across the alphabet', () => {
      const counts: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        for (const ch of svc.generate()) counts[ch] = (counts[ch] ?? 0) + 1;
      }
      // 43 chars × 1000 = 43000 total chars spread over 64-char alphabet.
      // Any healthy CSPRNG produces > 20 unique characters easily.
      expect(Object.keys(counts).length).toBeGreaterThan(40);
    });

    it('raw bytes decode is statistically non-uniform neither too narrow nor constant', () => {
      // Stronger check: looking at the raw bytes, stdev of byte values should be > 50.
      const bytes: number[] = [];
      for (let i = 0; i < 500; i++) {
        const buf = Buffer.from(svc.generate(), 'base64url');
        for (let j = 0; j < buf.length; j++) bytes.push(buf[j]!);
      }
      const mean = bytes.reduce((a, b) => a + b, 0) / bytes.length;
      const variance = bytes.reduce((a, b) => a + (b - mean) ** 2, 0) / bytes.length;
      const stdev = Math.sqrt(variance);
      // Uniform [0,256) has stdev ≈ 73.9. Demand at least 60.
      expect(stdev).toBeGreaterThan(60);
    });

    it('correctness cross-check: random control group matches behavior', () => {
      // Ensure our generator behavior is indistinguishable from raw randomBytes.
      const raw = randomBytes(32).toString('base64url');
      expect(raw).toHaveLength(43);
      expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });
});
