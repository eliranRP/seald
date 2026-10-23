import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DEFAULT_LOCALE } from 'shared';
import { loadTemplateSource } from './template-loader';

/**
 * Transactional email template registry + renderer.
 *
 * Layout — one folder per kind, three files each:
 *   src/email/templates/<kind>/body.html    — HTML body fragment
 *   src/email/templates/<kind>/body.txt     — plain-text body (mustache-ish {{var}})
 *   src/email/templates/<kind>/subject.txt  — one-line subject (mustache-ish)
 *
 * HTML fragments are wrapped into a complete <html> document using the
 * shared `_email.css` file at `templates/_email.css`. This keeps the
 * designer-authored fragments short and DRY — no need to inline 300 lines
 * of CSS into every template.
 *
 * At boot: each subdirectory is discovered, the fragment is wrapped once
 * and cached. Per-send cost is just variable interpolation + string concat.
 *
 * Variable interpolation uses a simple `{{var}}` replacement — no loops,
 * no conditionals. Add a templating engine if the need arises; for these
 * transactional emails this keeps dependencies narrow.
 */

export type EmailTemplateKind =
  | 'invite'
  | 'reminder'
  | 'completed'
  | 'declined_to_sender'
  | 'withdrawn_to_signer'
  | 'withdrawn_after_sign'
  | 'expired_to_sender'
  | 'expired_to_signer'
  | 'signed_to_sender'
  | 'api_key_created'
  | 'access_code'
  | 'approval_request'
  | 'approval_denied'
  | 'bulk_complete'
  | 'automation_copy'
  | 'automation_disabled'
  | 'signer_corrected'
  | 'signer_replaced'
  | 'new_link_requested'
  | 'your_turn'
  | 'bounced_to_sender';

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
  /** Keyed `<kind>:<locale>`; `en` is compiled eagerly at boot, others lazily. */
  private readonly compiled = new Map<string, CompiledTemplate>();
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
      this.compileOne(entry as EmailTemplateKind, DEFAULT_LOCALE);
    }
    this.log.log(`compiled ${this.compiled.size} email templates`);
  }

  private compileOne(kind: EmailTemplateKind, locale: string): CompiledTemplate {
    // Locale fallback (templates/<kind>/<locale>/ -> /en/ -> flat) lives in
    // template-loader.ts.
    const src = loadTemplateSource(this.templatesDir, kind, locale);
    const compiled: CompiledTemplate = {
      html: this.wrapFragment(kind, src.html),
      text: src.text,
      subject: src.subject,
    };
    this.compiled.set(compiledKey(kind, locale), compiled);
    return compiled;
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
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<style>
${this.sharedCss}
</style>
</head>
<body id="body" style="margin:0;padding:0;background:#f3f6fa;" bgcolor="#f3f6fa">
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
    locale: string = DEFAULT_LOCALE,
  ): RenderedTemplate {
    const tpl = this.compiled.get(compiledKey(kind, locale)) ?? this.compileLazily(kind, locale);
    return {
      // HTML body: escape every substituted value to neutralize stored XSS
      // / phishing-grade content injection (F-001). `*_html` keys are
      // pre-built by the trusted fragment builders in template-fragments.ts
      // and intentionally emit live markup — those are NOT escaped.
      html: interpolate(tpl.html, vars, this.log, kind, true),
      // Plain-text and subject channels have no HTML rendering context;
      // escaping them would mangle legitimate ampersands and angle
      // brackets in user content (e.g. "Q1 Roadmap & Pricing").
      text: interpolate(tpl.text, vars, this.log, kind, false),
      subject: interpolate(tpl.subject, vars, this.log, kind, false),
    };
  }

  private compileLazily(kind: EmailTemplateKind, locale: string): CompiledTemplate {
    // Only kinds that compiled at boot are known; anything else is a caller bug.
    if (!this.compiled.has(compiledKey(kind, DEFAULT_LOCALE))) {
      throw new Error(`TemplateService: unknown template kind '${kind}'`);
    }
    return this.compileOne(kind, locale);
  }

  /** Test-only helper: get the list of kinds that compiled successfully. */
  kinds(): readonly EmailTemplateKind[] {
    return [...this.compiled.keys()]
      .filter((k) => k.endsWith(`:${DEFAULT_LOCALE}`))
      .map((k) => k.slice(0, -(DEFAULT_LOCALE.length + 1)) as EmailTemplateKind);
  }
}

function compiledKey(kind: string, locale: string): string {
  return `${kind}:${locale}`;
}

const TITLES: Record<string, string> = {
  invite: "Seald — You've been asked to sign",
  reminder: 'Seald — Reminder: signature still needed',
  completed: 'Seald — Envelope complete',
  declined_to_sender: 'Seald — Request declined',
  withdrawn_to_signer: 'Seald — Request withdrawn',
  withdrawn_after_sign: 'Seald — Envelope withdrawn after signing',
  expired_to_sender: 'Seald — Envelope expired',
  expired_to_signer: 'Seald — Signing window closed',
  signed_to_sender: 'Seald — Signature recorded',
  api_key_created: 'Seald — New API key created',
  access_code: 'Seald — Your one-time code',
  approval_request: 'Seald — Approval needed',
  approval_denied: 'Seald — Request denied',
  bulk_complete: 'Seald — Bulk send finished',
  automation_copy: 'Seald — Automation notice',
  automation_disabled: 'Seald — Automation turned off',
  signer_corrected: 'Seald — Recipient changed',
  signer_replaced: 'Seald — You no longer need to sign',
  new_link_requested: 'Seald — New link requested',
  your_turn: 'Seald — Your turn to sign',
  bounced_to_sender: 'Seald — Email bounced',
};

function prettyTitle(kind: string): string {
  return TITLES[kind] ?? `Seald — ${kind}`;
}

const VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape HTML metacharacters in `input`. Mirrors the helper in
 * `template-fragments.ts`; duplicated locally to keep the two modules
 * decoupled (each owns its own trust boundary).
 */
function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

/**
 * `_html`-suffixed keys carry pre-built, fragment-builder-emitted markup
 * whose dynamic content has already been escaped at the boundary in
 * `template-fragments.ts`. They MUST reach the rendered HTML body
 * unchanged — escaping them would render visible angle brackets to the
 * recipient instead of the styled signer-list / timeline blocks.
 */
function isTrustedHtmlKey(key: string): boolean {
  return key.endsWith('_html');
}

/**
 * Keys whose HTML value is an email address or the 13-character short code.
 * Gmail and Apple Mail turn those into blue underlined links on their own, so
 * a zero-width joiner (U+200D) goes after the `@` and in the middle of the
 * code. It is invisible and breaks the detector's pattern. These keys are
 * used only as text in the templates, never inside an `href`; the plain-text
 * twin is not touched.
 */
const AUTO_LINK_EMAIL_KEYS = new Set([
  'sender_email',
  'signer_email',
  'decliner_email',
  'bounced_email',
  'approver_email',
]);
const ZWJ = '\u200d';

function shieldAutoLink(key: string, escaped: string): string {
  if (key === 'short_code') {
    return escaped.length > 6 ? `${escaped.slice(0, 6)}${ZWJ}${escaped.slice(6)}` : escaped;
  }
  if (AUTO_LINK_EMAIL_KEYS.has(key)) return escaped.replace(/@/g, `@${ZWJ}`);
  return escaped;
}

function interpolate(
  source: string,
  vars: Readonly<Record<string, string | number>>,
  log: Logger,
  kind: string,
  escapeForHtml: boolean,
): string {
  return source.replace(VAR_PATTERN, (_m: string, key: string): string => {
    const v = vars[key];
    if (v === undefined) {
      log.warn(`template '${kind}' missing variable '${key}' — rendered as empty string`);
      return '';
    }
    const stringified = typeof v === 'number' ? String(v) : v;
    if (escapeForHtml && !isTrustedHtmlKey(key)) {
      return shieldAutoLink(key, escapeHtml(stringified));
    }
    return stringified;
  });
}
