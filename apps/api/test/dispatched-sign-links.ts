import type { INestApplication } from '@nestjs/common';
import { EmailDispatcherService } from '../src/email/email-dispatcher.service';
import { EmailSender, type EmailMessage } from '../src/email/email-sender';

/** `/sign/<envelope uuid>?t=<43-char token>` in a rendered message. */
const SIGN_LINK = /\/sign\/([0-9a-f-]{36})\?t=([A-Za-z0-9_-]{43})/;

export interface DispatchedSignLink {
  readonly to: string;
  readonly envelopeId: string;
  readonly token: string;
  readonly message: EmailMessage;
}

/**
 * Drain the outbox the way `EmailWorkerService` does and return every
 * signing link that went out, in send order.
 *
 * MCP Insert A: the signer token is minted at dispatch and exists only in
 * the sent message, never in `outbound_emails.payload`. Tests that need a
 * token therefore read it from what the dispatcher handed to the sender.
 * The sender is stubbed for the drain so nothing is written to disk.
 */
export async function dispatchSignLinks(
  app: INestApplication,
  envelopeIds?: readonly string[],
): Promise<DispatchedSignLink[]> {
  const sender = app.get(EmailSender);
  const sent: EmailMessage[] = [];
  const spy = jest.spyOn(sender, 'send').mockImplementation(async (msg: EmailMessage) => {
    sent.push(msg);
    return { providerId: `test-${msg.idempotencyKey}` };
  });
  try {
    await app.get(EmailDispatcherService).flushOnce(500, envelopeIds ? { envelopeIds } : undefined);
  } finally {
    spy.mockRestore();
  }
  const links: DispatchedSignLink[] = [];
  for (const message of sent) {
    const match = SIGN_LINK.exec(message.text);
    if (!match?.[1] || !match[2]) continue;
    links.push({ to: message.to.email, envelopeId: match[1], token: match[2], message });
  }
  return links;
}

/** Drain the outbox and return the token most recently sent to `email`. */
export async function dispatchSignToken(app: INestApplication, email: string): Promise<string> {
  const links = await dispatchSignLinks(app);
  const link = links.filter((item) => item.to === email).pop();
  if (!link) throw new Error(`no signing link was sent to ${email}`);
  return link.token;
}
