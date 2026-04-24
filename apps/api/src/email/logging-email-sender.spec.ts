import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EmailMessage } from './email-sender';
import { LoggingEmailSender } from './logging-email-sender';

describe('LoggingEmailSender', () => {
  const mailDir = resolve(process.cwd(), '.seald-mail');
  let sender: LoggingEmailSender;

  beforeEach(() => {
    sender = new LoggingEmailSender();
  });

  afterAll(() => {
    if (existsSync(mailDir)) {
      rmSync(mailDir, { recursive: true, force: true });
    }
  });

  it('returns a providerId derived from the idempotency key', async () => {
    const msg: EmailMessage = buildMsg({ idempotencyKey: 'abc-123-key' });
    const out = await sender.send(msg);
    expect(out.providerId).toBe('logging-abc-123-key');
  });

  it('writes three files (html + txt + meta.json) to .seald-mail/', async () => {
    // Filename carries the first 8 chars of the idempotency key.
    const msg: EmailMessage = buildMsg({ idempotencyKey: 'writesfilesA' });
    await sender.send(msg);
    const matchingFiles = readMailDirMatching('writesfi');
    expect(matchingFiles.filter((f) => f.endsWith('.html'))).toHaveLength(1);
    expect(matchingFiles.filter((f) => f.endsWith('.txt'))).toHaveLength(1);
    expect(matchingFiles.filter((f) => f.endsWith('.meta.json'))).toHaveLength(1);
  });

  it('embeds the rendered HTML in the .html file', async () => {
    const msg: EmailMessage = buildMsg({
      idempotencyKey: 'html-check',
      html: '<!doctype html><p>Hello Ada</p>',
    });
    await sender.send(msg);
    const [htmlFile] = readMailDirMatching('html-che').filter((f) => f.endsWith('.html'));
    expect(htmlFile).toBeDefined();
    const content = readFileSync(resolve(mailDir, htmlFile!), 'utf8');
    expect(content).toContain('Hello Ada');
  });

  it('meta.json captures subject + to + from', async () => {
    const msg: EmailMessage = buildMsg({
      idempotencyKey: 'meta-check',
      subject: 'My subject',
    });
    await sender.send(msg);
    const [metaFile] = readMailDirMatching('meta-che').filter((f) => f.endsWith('.meta.json'));
    expect(metaFile).toBeDefined();
    const parsed = JSON.parse(readFileSync(resolve(mailDir, metaFile!), 'utf8')) as {
      subject: string;
      to: { email: string };
      from: { email: string };
    };
    expect(parsed.subject).toBe('My subject');
    expect(parsed.to.email).toBe('signer@example.com');
    expect(parsed.from.email).toBe('noreply@seald.app');
  });

  it('uses X-Seald-Kind header in the filename prefix', async () => {
    const msg: EmailMessage = buildMsg({
      idempotencyKey: 'kind-test',
      headers: { 'X-Seald-Kind': 'invite' },
    });
    await sender.send(msg);
    const matching = readMailDirMatching('kind-tes');
    expect(matching.length).toBeGreaterThan(0);
    expect(matching.every((f) => f.includes('-invite-'))).toBe(true);
  });
});

function buildMsg(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    to: { email: 'signer@example.com', name: 'Signer' },
    from: { email: 'noreply@seald.app', name: 'Seald' },
    subject: 'Please sign',
    html: '<p>Hi</p>',
    text: 'Hi',
    idempotencyKey: 'idem-123',
    ...overrides,
  } as EmailMessage;
}

import { readdirSync } from 'node:fs';

function readMailDirMatching(fragment: string): string[] {
  const dir = resolve(process.cwd(), '.seald-mail');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.includes(fragment));
}
