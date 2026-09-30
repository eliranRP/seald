import { BadRequestException } from '@nestjs/common';

/**
 * Who the invite and reminder mail is from.
 *
 * A JWT email always wins, so a signed-in sender cannot impersonate
 * someone else through the body. `sender_email` and `sender_name` are
 * only read for anonymous sessions, where the JWT carries no email.
 * MCP calls this with the key owner's mailbox and an empty body.
 */
export interface SenderIdentity {
  readonly email: string;
  readonly name: string | null;
}

export function resolveSenderIdentity(
  user: { readonly email: string | null },
  body: { readonly sender_email?: string; readonly sender_name?: string | null } = {},
): SenderIdentity {
  const email = user.email ?? body.sender_email ?? null;
  if (!email) {
    throw new BadRequestException('sender_email_missing');
  }
  const name = user.email ? null : (body.sender_name ?? null);
  return { email, name };
}
