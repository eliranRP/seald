import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import mjml2html from 'mjml';

/**
 * Transactional email template registry + renderer.
 *
 * Layout:
 *   src/email/templates/<kind>.mjml      — HTML body (MJML source)
 *   src/email/templates/<kind>.txt       — plain-text body (mustache-ish {{var}})
 *   src/email/templates/<kind>.subject   — one-line subject (mustache-ish)
 *
 * At boot: MJML source is compiled to HTML once and cached. Per-send cost
 * is just variable interpolation + string concat.
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
    const files = readdirSync(this.templatesDir);
    const kinds = new Set<string>();
    for (const f of files) {
      const match = /^([a-z_]+)\.(mjml|txt|subject)$/.exec(f);
      if (match) kinds.add(match[1]!);
    }
    for (const kind of kinds) {
      this.compileOne(kind as EmailTemplateKind);
    }
    this.log.log(`compiled ${this.compiled.size} email templates`);
  }

  private compileOne(kind: EmailTemplateKind): void {
    const mjmlPath = resolve(this.templatesDir, `${kind}.mjml`);
    const txtPath = resolve(this.templatesDir, `${kind}.txt`);
    const subjectPath = resolve(this.templatesDir, `${kind}.subject`);
    if (!existsSync(mjmlPath) || !existsSync(txtPath) || !existsSync(subjectPath)) {
      throw new Error(
        `TemplateService: incomplete template set for '${kind}' — expected ${kind}.mjml, ${kind}.txt, ${kind}.subject`,
      );
    }
    const mjml = readFileSync(mjmlPath, 'utf8');
    // MJML 4 is synchronous; @types/mjml@4 still types it as async. Cast to
    // the real runtime shape rather than awaiting a non-Promise.
    const { html, errors } = mjml2html(mjml, { validationLevel: 'strict' }) as unknown as {
      html: string;
      errors: Array<{ tagName?: string; message: string }>;
    };
    if (errors.length > 0) {
      const summary = errors.map((e) => `${e.tagName ?? '?'}: ${e.message}`).join('; ');
      throw new Error(`TemplateService: MJML errors in ${kind}.mjml — ${summary}`);
    }
    this.compiled.set(kind, {
      html,
      text: readFileSync(txtPath, 'utf8'),
      subject: readFileSync(subjectPath, 'utf8').trim(),
    });
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
