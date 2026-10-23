import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from '../../config/env.schema';

/**
 * Transactional mail identifies the sender as "Seald" plus the published
 * postal line. The operator's personal name stays off these templates.
 */
const TEMPLATES = [
  'access_code',
  'api_key_created',
  'automation_disabled',
  'approval_denied',
  'approval_request',
  'automation_copy',
  'bulk_complete',
  'completed',
  'declined_to_sender',
  'expired_to_sender',
  'expired_to_signer',
  'invite',
  'new_link_requested',
  'reminder',
  'signed_to_sender',
  'signer_corrected',
  'signer_replaced',
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
    // Fake 32-byte key: workflowAutomations ships on, so boot needs one.
    AUTOMATION_SECRETS_KEY: 'ab'.repeat(32),
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

  describe('automation_copy (WP-33)', () => {
    const html = readFileSync(resolve(__dirname, '../templates/automation_copy/body.html'), 'utf8');
    const text = readFileSync(resolve(__dirname, '../templates/automation_copy/body.txt'), 'utf8');

    it('says who added the recipient and offers a stop link in the HTML footer', () => {
      const foot = html.slice(html.indexOf('<div class="foot">'));
      expect(foot).toContain('{{sender_email}}');
      expect(foot).toContain('added you to a Seald automation');
      expect(foot).toContain('href="{{stop_url}}"');
      expect(foot).toContain('Stop these notices');
    });

    it('carries the same footer lines in the plain-text body', () => {
      expect(text).toContain(
        'You are receiving this because {{sender_email}} added you to a Seald automation.',
      );
      expect(text).toContain('{{stop_url}}');
      expect(text).toContain('{{legal_entity}} · {{legal_postal}}');
    });

    it('has no signing link, download link or attachment variable', () => {
      for (const body of [html, text]) {
        expect(body).not.toMatch(/\{\{\s*(sign_url|sealed_url|download_url|audit_url)\s*\}\}/);
      }
    });
  });
});
