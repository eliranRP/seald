import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const AUDIT_TRAIL_OPERATOR_LINE =
  'Seald · PAdES seal when applied · RFC 3161 timestamp when available';

/**
 * The certificate cover used to say "Seald, Inc. · Retained for N years ·
 * PAdES-LT Advanced". A noop signer applies no CMS seal, a timestamp is
 * best-effort, and ENVELOPE_RETENTION_YEARS does not delete anything.
 */
const RETIRED_CLAIMS = [
  'Seald, Inc.',
  'Retained 7 years',
  'Retained for',
  'PAdES-LT',
  'PAdES-LTV',
  'Advanced Electronic Signature',
] as const;

describe('audit PDF operator line', () => {
  it('states the brand and only the seal and timestamp the pipeline can actually apply', () => {
    const source = readFileSync(resolve(__dirname, '../audit-pdf.tsx'), 'utf8');
    expect(source).toContain(`'${AUDIT_TRAIL_OPERATOR_LINE}'`);
    expect(source).toContain('{AUDIT_TRAIL_OPERATOR_LINE}');
    expect(source).toContain('issued by Seald');
    for (const claim of RETIRED_CLAIMS) {
      expect(source).not.toContain(claim);
    }
  });
});

describe('API source and email templates', () => {
  it('does not hard-code Seald, Inc., a 7-year retention promise, or PAdES-LT', () => {
    const files = collectSources(resolve(__dirname, '../..'));
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const claim of ['Seald, Inc.', 'Retained 7 years', 'PAdES-LT', 'PAdES-LTV'] as const) {
        if (text.includes(claim)) hits.push(`${file}: ${claim}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSources(full));
      continue;
    }
    if (entry.endsWith('.spec.ts') || entry.endsWith('.spec.tsx')) continue;
    if (!/\.(tsx?|html|txt)$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}
