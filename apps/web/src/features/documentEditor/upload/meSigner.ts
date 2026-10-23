import { seald } from '@/styles/theme';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';

/**
 * "Me" is the sender listed as a signer. It is not a saved contact, so its
 * id carries a prefix: that keeps it out of the UUID check that sends
 * contact ids to the API and makes the send use the inline name and email.
 */
export const ME_SIGNER_PREFIX = 'me:';

export function isMeSignerId(id: string): boolean {
  return id.startsWith(ME_SIGNER_PREFIX);
}

export function makeMeSigner(user: {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}): AddSignerContact {
  return {
    id: `${ME_SIGNER_PREFIX}${user.id}`,
    name: user.name.trim().length > 0 ? user.name : user.email,
    email: user.email,
    color: seald.color.signer[0] ?? seald.color.indigo[400],
  };
}
