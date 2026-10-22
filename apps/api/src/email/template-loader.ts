import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_LOCALE } from 'shared';

/**
 * Locale-aware template file resolution (WP-38).
 *
 * A template kind lives at `templates/<kind>/`. Locale variants live in
 * `templates/<kind>/<locale>/`. Resolution order, first complete set wins:
 *
 *   1. `templates/<kind>/<locale>/`
 *   2. `templates/<kind>/<DEFAULT_LOCALE>/`
 *   3. `templates/<kind>/`   (legacy flat layout, still the live one)
 *
 * A "complete set" is body.html + body.txt + subject.txt.
 */

export const TEMPLATE_FILES = ['body.html', 'body.txt', 'subject.txt'] as const;

export interface TemplateSource {
  readonly html: string;
  readonly text: string;
  readonly subject: string;
  /** Directory the files were read from. */
  readonly dir: string;
}

function isCompleteSet(dir: string): boolean {
  return TEMPLATE_FILES.every((f) => existsSync(resolve(dir, f)));
}

/** Locale tags are used as path segments; reject anything that could escape the kind dir. */
function isSafeSegment(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

/** Ordered candidate directories for a kind + locale (deduplicated). */
export function templateCandidates(
  templatesDir: string,
  kind: string,
  locale: string,
): readonly string[] {
  const kindDir = resolve(templatesDir, kind);
  const dirs: string[] = [];
  if (isSafeSegment(locale)) dirs.push(resolve(kindDir, locale));
  dirs.push(resolve(kindDir, DEFAULT_LOCALE), kindDir);
  return [...new Set(dirs)];
}

/** Directory holding the complete template set for `kind` in `locale`, or `undefined`. */
export function resolveTemplateDir(
  templatesDir: string,
  kind: string,
  locale: string,
): string | undefined {
  return templateCandidates(templatesDir, kind, locale).find(isCompleteSet);
}

/** Read the raw template files, applying the locale fallback chain. */
export function loadTemplateSource(
  templatesDir: string,
  kind: string,
  locale: string,
): TemplateSource {
  const dir = resolveTemplateDir(templatesDir, kind, locale);
  if (!dir) {
    throw new Error(
      `template-loader: incomplete template set at '${kind}/' — expected body.html + body.txt + subject.txt`,
    );
  }
  return {
    html: readFileSync(resolve(dir, 'body.html'), 'utf8'),
    text: readFileSync(resolve(dir, 'body.txt'), 'utf8'),
    subject: readFileSync(resolve(dir, 'subject.txt'), 'utf8').trim(),
    dir,
  };
}
