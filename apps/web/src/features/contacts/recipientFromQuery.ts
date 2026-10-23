import { guessContactName, isEmailShape } from 'shared';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import { seald } from '@/styles/theme';
import { pickAvailableColor } from '@/features/signers/pickAvailableColor';

/** Query arg on `/document/new` that names the person to send to. */
export const TO_QUERY_PARAM = 'to';

/** Id prefix for a recipient that is not a saved contact (sent inline, not by contact id). */
export const QUERY_RECIPIENT_PREFIX = 'to:';

/**
 * The signer a `?to=<email>` link asks for: the saved contact with that email,
 * or a one-off recipient built from the address. Null when the arg is missing
 * or not an email, or that person is already on the list.
 */
export function recipientFromQuery(
  raw: string | null,
  contacts: ReadonlyArray<AddSignerContact>,
  existing: ReadonlyArray<AddSignerContact>,
): AddSignerContact | null {
  const email = raw?.trim().toLowerCase() ?? '';
  if (email.length === 0 || !isEmailShape(email)) return null;
  if (existing.some((s) => s.email.toLowerCase() === email)) return null;
  const saved = contacts.find((c) => c.email.toLowerCase() === email);
  const used = existing.map((s) => s.color);
  const color =
    saved && !used.includes(saved.color)
      ? saved.color
      : pickAvailableColor(seald.color.signer, used);
  if (saved) return { id: saved.id, name: saved.name, email: saved.email, color };
  return {
    id: `${QUERY_RECIPIENT_PREFIX}${email}`,
    name: guessContactName(email),
    email,
    color,
  };
}
