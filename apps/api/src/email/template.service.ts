import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import mjml2html from 'mjml';

/**
 * Transactional email template registry + renderer.
 *
 * Layout — one folder per kind, three files each:
 *   src/email/templates/<kind>/body.html    — HTML body fragment (preferred)
 *                                              OR body.mjml (legacy MJML source)
 *   src/email/templates/<kind>/body.txt     — plain-text body (mustache-ish {{var}})
 *   src/email/templates/<kind>/subject.txt  — one-line subject (mustache-ish)
 *
 * HTML fragments are wrapped into a complete <html> document using the
 * shared `_email.css` file at `templates/_email.css`. This keeps the
 * designer-authored fragments short and DRY — no need to inline 300 lines
 * of CSS into every template.
 *
 * At boot: each subdirectory is discovered, the fragment is wrapped (or
 * MJML compiled to HTML) once and cached. Per-send cost is just variable
 * interpolation + string concat.
 *
 * Variable interpolation uses a simple `{{var}}` replacement — no loops,
 * no conditionals. Add a templating engine if the need arises; for eight
 * tiny transactional emails this keeps dependencies narrow.
 */

export type EmailTemplateKind =
  | 'invite'
  | 'reminder'
  | 'completed'
  | 'declined_to_sender'
  | 'withdrawn_to_signer'
  | 'withdrawn_after_sign'
  | 'expired_to_sender'
  | 'expired_to_signer';

interface CompiledTemplate {
  readonly html: string;
  readonly text: string;
  readonly subject: string;
}

export interface RenderedTemplate {
  readonly html: string;
  readonly text: string;
  readonly subject: string;
}

@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly log = new Logger('TemplateService');
  private readonly compiled = new Map<EmailTemplateKind, CompiledTemplate>();
  private readonly templatesDir: string;
  private sharedCss = '';

  constructor() {
    // Resolve from the compiled `dist/` location OR the `src/` location —
    // tests run against src, prod runs against dist. Both trees contain the
    // same relative templates/ directory after `nest build` copies them.
    const candidates = [
      resolve(__dirname, 'templates'),
      resolve(__dirname, '..', '..', 'src', 'email', 'templates'),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) {
      throw new Error(`TemplateService: templates dir not found in ${candidates.join(', ')}`);
    }
    this.templatesDir = found;
  }

  onModuleInit(): void {
    this.loadAll();
  }

  /** Eagerly compile every template. Called once at boot. */
  private loadAll(): void {
    const sharedCssPath = resolve(this.templatesDir, '_email.css');
    this.sharedCss = existsSync(sharedCssPath) ? readFileSync(sharedCssPath, 'utf8') : '';
    const entries = readdirSync(this.templatesDir);
    for (const entry of entries) {
      const entryPath = resolve(this.templatesDir, entry);
      if (!statSync(entryPath).isDirectory()) continue;
      this.compileOne(entry as EmailTemplateKind);
    }
    this.log.log(`compiled ${this.compiled.size} email templates`);
  }

  private compileOne(kind: EmailTemplateKind): void {
    const dir = resolve(this.templatesDir, kind);
    const htmlPath = resolve(dir, 'body.html');
    const mjmlPath = resolve(dir, 'body.mjml');
    const txtPath = resolve(dir, 'body.txt');
    const subjectPath = resolve(dir, 'subject.txt');
    if (!existsSync(txtPath) || !existsSync(subjectPath)) {
      throw new Error(
        `TemplateService: incomplete template set at '${kind}/' — expected body.html or body.mjml + body.txt + subject.txt`,
      );
    }
    let html: string;
    if (existsSync(htmlPath)) {
      const fragment = readFileSync(htmlPath, 'utf8');
      html = this.wrapFragment(kind, fragment);
    } else if (existsSync(mjmlPath)) {
      const mjml = readFileSync(mjmlPath, 'utf8');
      // MJML 4 is synchronous; @types/mjml@4 still types it as async. Cast to
      // the real runtime shape rather than awaiting a non-Promise.
      const compiled = mjml2html(mjml, { validationLevel: 'strict' }) as unknown as {
        html: string;
        errors: Array<{ tagName?: string; message: string }>;
      };
      if (compiled.errors.length > 0) {
        const summary = compiled.errors.map((e) => `${e.tagName ?? '?'}: ${e.message}`).join('; ');
        throw new Error(`TemplateService: MJML errors in ${kind}/body.mjml — ${summary}`);
      }
      html = compiled.html;
    } else {
      throw new Error(`TemplateService: ${kind}/ has neither body.html nor body.mjml`);
    }
    this.compiled.set(kind, {
      html,
      text: readFileSync(txtPath, 'utf8'),
      subject: readFileSync(subjectPath, 'utf8').trim(),
    });
  }

  private wrapFragment(kind: EmailTemplateKind, fragment: string): string {
    const title = prettyTitle(kind);
    // `format-detection` tells iOS Mail + Outlook not to auto-link
    // emails / phone numbers in the body. Gmail ignores the meta but
    // the auto-link reset rules in `_email.css` cover it there.
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="format-detection" content="telephone=no,email=no,address=no,date=no">
<meta name="x-apple-disable-message-reformatting">
<title>${title}</title>
<style>
${this.sharedCss}
</style>
</head>
<body>
${fragment}
</body>
</html>`;
  }

  /**
   * Render a template with the given variables. Missing variables render as
   * empty strings (with a log warning) so a missing field never blocks a
   * critical notification — but tests should assert the important variables
   * are always provided.
   */
  render(
    kind: EmailTemplateKind,
    vars: Readonly<Record<string, string | number>>,
  ): RenderedTemplate {
    const tpl = this.compiled.get(kind);
    if (!tpl) {
      throw new Error(`TemplateService: unknown template kind '${kind}'`);
    }
    const interp = (s: string) => interpolate(s, vars, this.log, kind);
    return {
      html: interp(tpl.html),
      text: interp(tpl.text),
      subject: interp(tpl.subject),
    };
  }

  /** Test-only helper: get the list of kinds that compiled successfully. */
  kinds(): readonly EmailTemplateKind[] {
    return [...this.compiled.keys()];
  }
}

const TITLES: Record<string, string> = {
  invite: "Sealed — You've been asked to sign",
  reminder: 'Sealed — Reminder: signature still needed',
  completed: 'Sealed — Envelope complete',
  declined_to_sender: 'Sealed — Request declined',
  withdrawn_to_signer: 'Sealed — Request withdrawn',
  withdrawn_after_sign: 'Sealed — Envelope withdrawn after signing',
  expired_to_sender: 'Sealed — Envelope expired',
  expired_to_signer: 'Sealed — Signing window closed',
};

function prettyTitle(kind: string): string {
  return TITLES[kind] ?? `Sealed — ${kind}`;
}

const VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function interpolate(
  source: string,
  vars: Readonly<Record<string, string | number>>,
  log: Logger,
  kind: string,
): string {
  return source.replace(VAR_PATTERN, (_m: string, key: string): string => {
    const v = vars[key];
    if (v !== undefined) {
      return typeof v === 'number' ? String(v) : v;
    }
    log.warn(`template '${kind}' missing variable '${key}' — rendered as empty string`);
    return '';
  });
}
