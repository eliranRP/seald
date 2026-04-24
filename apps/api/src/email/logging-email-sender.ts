import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { EmailSender, type EmailMessage, type EmailSendResult } from './email-sender';

/**
 * Dev + test adapter. Writes the rendered HTML + text to a local folder so
 * you can open the mail in a browser without hitting a real SMTP provider.
 *
 * Output directory defaults to `<cwd>/.seald-mail/` — gitignored.
 * Provider id is a deterministic hash so retries produce the same id (matches
 * how real providers dedupe via Idempotency-Key).
 */
@Injectable()
export class LoggingEmailSender extends EmailSender {
  private readonly log = new Logger('LoggingEmailSender');
  private readonly outDir: string;

  constructor() {
    super();
    this.outDir = resolve(process.cwd(), '.seald-mail');
    try {
      mkdirSync(this.outDir, { recursive: true });
    } catch {
      // Best effort — if we can't create the dir, send() will still work and
      // we just skip the file write.
    }
  }

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeKind = sanitizeForFilename(extractKind(msg));
    const safeTo = sanitizeForFilename(msg.to.email);
    const base = `${ts}-${safeKind}-${safeTo}-${msg.idempotencyKey.slice(0, 8)}`;

    try {
      writeFileSync(resolve(this.outDir, `${base}.html`), msg.html, 'utf8');
      writeFileSync(resolve(this.outDir, `${base}.txt`), msg.text, 'utf8');
      writeFileSync(
        resolve(this.outDir, `${base}.meta.json`),
        JSON.stringify(
          {
            from: msg.from,
            to: msg.to,
            subject: msg.subject,
            headers: msg.headers ?? {},
            idempotencyKey: msg.idempotencyKey,
            writtenAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf8',
      );
    } catch (err) {
      // Log but don't fail the send — dev runs without filesystem shouldn't break.
      this.log.warn(`wrote email files failed: ${String(err)}`);
    }

    this.log.log(`email[${safeKind}] → ${msg.to.email} — "${msg.subject}"`);
    // Surface any sign/verify URL embedded in the plain-text body so the
    // demo flow doesn't require a real mailbox. Looks for the first line
    // that matches http(s)://…/sign/… or …/verify/… or ?t=…
    const urlMatch = msg.text.match(/https?:\/\/\S+/g) ?? [];
    const signUrl = urlMatch.find((u) => u.includes('/sign/') || u.includes('?t=')) ?? null;
    if (signUrl) {
      this.log.log(`email[${safeKind}] sign URL: ${signUrl}`);
    }
    return { providerId: `logging-${msg.idempotencyKey}` };
  }
}

/**
 * Look up the `X-Seald-Kind` header (set by the template renderer) for file
 * naming; fall back to 'unknown' if absent.
 */
function extractKind(msg: EmailMessage): string {
  return msg.headers?.['X-Seald-Kind'] ?? 'unknown';
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}
