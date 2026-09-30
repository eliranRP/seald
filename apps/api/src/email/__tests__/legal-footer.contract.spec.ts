import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from '../../config/env.schema';

/**
 * Transactional mail identifies the sender as "Seald" plus the published
 * postal line. The operator's personal name stays off these templates.
 */
const TEMPLATES = [
  'completed',
  'declined_to_sender',
  'expired_to_sender',
  'expired_to_signer',
  'invite',
  'reminder',
  'signed_to_sender',
  'withdrawn_after_sign',
  'withdrawn_to_signer',
] as const;

const POSTAL = 'Chlenov 24, Tel Aviv-Yafo 6604806, Israel';

describe('legal email footer', () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    CORS_ORIGIN: 'http://localhost:5173',
    APP_PUBLIC_URL: 'http://localhost:5173',
    DATABASE_URL: 'postgres://u:p@host:5432/db',
  });

  it('defaults the footer to Seald and the Tel Aviv postal line', () => {
    expect(env.EMAIL_LEGAL_ENTITY).toBe('Seald');
    expect(env.EMAIL_LEGAL_POSTAL).toBe(POSTAL);
    expect(`${env.EMAIL_LEGAL_ENTITY} · ${env.EMAIL_LEGAL_POSTAL}`).toBe(`Seald · ${POSTAL}`);
    expect(env.EMAIL_LEGAL_ENTITY).not.toMatch(/Azulay|Eliran|Inc\./);
    expect(env.EMAIL_LEGAL_POSTAL).not.toMatch(/Azulay|Eliran/);
  });

  it.each(TEMPLATES)('%s separates the brand and the postal line with a middle dot', (name) => {
    const html = readFileSync(resolve(__dirname, `../templates/${name}/body.html`), 'utf8');
    expect(html).toContain(
      '<strong style="color: #1f2937">{{legal_entity}}</strong> · {{legal_postal}}<br />',
    );
    expect(html).not.toContain('</strong>, {{legal_postal}}');
    expect(html).not.toMatch(/Azulay|Eliran/);
  });
});
