import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Public pages name an individual operator. "Seald, Inc.", Wilmington, and
 * operator-Delaware wording stay out of that copy.
 *
 * Two carve-outs are deliberate:
 * - Terms §12 (governing law) and §13 (dispute resolution) still say
 *   Delaware and Wilmington. Replacing the AAA clause is pending the
 *   owner's approval.
 * - "Delaware" in the privacy-statute lists names a US state law, not
 *   the operator.
 */

const LANDING = resolve(__dirname, '../../../landing');
const REPO = resolve(__dirname, '../../../..');

const RETIRED_MAILBOXES = [
  'legal@seald.nromomentum.com',
  'security@seald.nromomentum.com',
  'abuse@seald.nromomentum.com',
  'hello@seald.nromomentum.com',
  'accessibility@seald.nromomentum.com',
  'subscribe-subprocessors@seald.nromomentum.com',
] as const;

const CORPORATE_WORDING = [
  'Seald, Inc.',
  'a Delaware corporation',
  'pre-incorporation',
  'registered agent',
  'officers, directors',
  'state of incorporation',
] as const;

const STATUTE_DELAWARE = [
  'the Delaware Personal Data Privacy Act',
  'Iowa, Delaware, New Hampshire',
  'Indiana, Delaware, New Jersey',
] as const;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function astroFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...astroFiles(path));
    } else if (name.endsWith('.astro')) {
      out.push(path);
    }
  }
  return out;
}

function section(source: string, id: string): string {
  const match = source.match(new RegExp(`<section id="${id}">[\\s\\S]*?</section>`));
  return match?.[0] ?? '';
}

function withoutSections(source: string, ids: readonly string[]): string {
  return ids.reduce(
    (text, id) => text.replace(new RegExp(`<section id="${id}">[\\s\\S]*?</section>`), ''),
    source,
  );
}

describe('operator identity on public pages', () => {
  const pages = astroFiles(resolve(LANDING, 'src/pages'));
  const extra = [resolve(LANDING, 'public/.well-known/security.txt'), resolve(REPO, 'SECURITY.md')];
  const files = [...pages, ...extra];

  it('drops retired mailboxes', () => {
    for (const file of files) {
      const source = read(file);
      for (const mailbox of RETIRED_MAILBOXES) {
        expect(source, file).not.toContain(mailbox);
      }
    }
  });

  it('does not call the operator Seald, Inc. or use corporate-formation wording', () => {
    for (const file of files) {
      const source = read(file);
      for (const phrase of CORPORATE_WORDING) {
        expect(source, `${file} contains ${phrase}`).not.toContain(phrase);
      }
    }
  });

  it('keeps Wilmington inside Terms §13 only', () => {
    const terms = read(resolve(LANDING, 'src/pages/legal/terms.astro'));
    const dispute = section(terms, 'dispute');
    expect(dispute).toContain('Wilmington');
    expect(withoutSections(terms, ['dispute'])).not.toContain('Wilmington');
    for (const file of files) {
      if (file.endsWith('terms.astro')) continue;
      expect(read(file), file).not.toContain('Wilmington');
    }
  });

  it('keeps Delaware inside deferred Terms §12 and §13, and in privacy-statute lists', () => {
    const terms = read(resolve(LANDING, 'src/pages/legal/terms.astro'));
    expect(section(terms, 'governing-law')).toContain('Delaware');
    expect(section(terms, 'dispute')).toContain('Delaware');
    const privacy = read(resolve(LANDING, 'src/pages/legal/privacy.astro'));
    const dsar = read(resolve(LANDING, 'src/pages/dsar.astro'));
    expect(privacy).toContain('the Delaware Personal Data Privacy Act');
    expect(dsar).toContain('Indiana, Delaware, New Jersey');

    const stripped = files
      .map((file) => {
        let source = read(file);
        if (file.endsWith('terms.astro')) {
          source = withoutSections(source, ['governing-law', 'dispute']);
        }
        for (const phrase of STATUTE_DELAWARE) {
          source = source.replaceAll(phrase, '');
        }
        return source;
      })
      .join('\n');
    expect(stripped).not.toContain('Delaware');
  });

  it('names the individual operator, the postal address, the liability cap, and the CCPA threshold note', () => {
    const terms = read(resolve(LANDING, 'src/pages/legal/terms.astro'));
    const privacy = read(resolve(LANDING, 'src/pages/legal/privacy.astro'));
    const dpa = read(resolve(LANDING, 'src/pages/legal/dpa.astro'));
    const imprint = read(resolve(LANDING, 'src/pages/legal/imprint.astro'));
    expect(terms).toContain(
      'Eliran Azulay, an individual resident in Israel, who operates the Seald service under the name "Seald"',
    );
    expect(terms).toContain(
      'ONE HUNDRED U.S. DOLLARS (US $100) (OR THREE HUNDRED FIFTY NEW ISRAELI SHEKELS (₪350) IF YOU RESIDE IN ISRAEL)',
    );
    expect(terms).toContain(
      'NOTHING IN THIS SECTION LIMITS LIABILITY FOR FRAUD, WILFUL MISCONDUCT, GROSS NEGLIGENCE, OR ANY LIABILITY THAT CANNOT BE LIMITED UNDER APPLICABLE CONSUMER-PROTECTION LAW.',
    );
    expect(terms).toContain('Chlenov 24, Tel Aviv-Yafo 6604806, Israel');
    expect(privacy).toContain(
      "who is the controller (under Israel's Protection of Privacy Law, 5741-1981, the database controller)",
    );
    expect(privacy).toContain(
      'Seald does not currently meet the thresholds that make these laws apply to it; we nonetheless honour the requests below voluntarily.',
    );
    expect(dpa).toContain(
      'Eliran Azulay, an individual trading as "Seald", Chlenov 24, Tel Aviv-Yafo 6604806, Israel',
    );
    expect(dpa).not.toContain('GDPR');
    expect(dpa).not.toContain('SCC');
    expect(imprint).toContain('trading as "Seald" (no company)');
    expect(imprint).not.toContain('Telemediengesetz');
    expect(imprint).not.toContain('ec.europa.eu/consumers/odr');
    expect(privacy).not.toContain('EU representative');
    expect(privacy).not.toContain('UK representative');
  });
});
