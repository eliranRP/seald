import { isEmailShape, splitEmailList } from 'shared';

/**
 * How a pasted address will be treated when the list is added:
 * `new` becomes a contact, `duplicate` is already saved (or repeats earlier
 * in the paste) and is skipped, `invalid` is not an email address.
 */
export type EmailChipKind = 'new' | 'duplicate' | 'invalid';

export interface EmailChip {
  /** Stable key: the address plus how many times it appeared before. */
  readonly id: string;
  readonly email: string;
  readonly kind: EmailChipKind;
  /** Why a duplicate is a duplicate. */
  readonly duplicateOf?: 'saved' | 'paste' | undefined;
}

export interface EmailChipCounts {
  readonly added: number;
  readonly duplicates: number;
  readonly invalid: number;
}

/**
 * Classify committed tokens against the saved contacts' emails
 * (lower-cased). The first copy of an address wins; later copies are
 * duplicates.
 */
export function classifyEmails(
  tokens: ReadonlyArray<string>,
  existing: ReadonlySet<string>,
): EmailChip[] {
  const seen = new Map<string, number>();
  return tokens.map((raw) => {
    const email = raw.trim().toLowerCase();
    const n = seen.get(email) ?? 0;
    seen.set(email, n + 1);
    const id = `${email}#${String(n)}`;
    if (!isEmailShape(email)) return { id, email, kind: 'invalid' };
    if (existing.has(email)) return { id, email, kind: 'duplicate', duplicateOf: 'saved' };
    if (n > 0) return { id, email, kind: 'duplicate', duplicateOf: 'paste' };
    return { id, email, kind: 'new' };
  });
}

export function countEmailChips(chips: ReadonlyArray<EmailChip>): EmailChipCounts {
  let added = 0;
  let duplicates = 0;
  let invalid = 0;
  for (const c of chips) {
    if (c.kind === 'new') added += 1;
    else if (c.kind === 'duplicate') duplicates += 1;
    else invalid += 1;
  }
  return { added, duplicates, invalid };
}

/** "3 new · 1 already saved · 1 invalid"; zero parts are left out. */
export function summarizeEmailChips(counts: EmailChipCounts): string {
  const parts: string[] = [];
  if (counts.added > 0) parts.push(`${String(counts.added)} new`);
  if (counts.duplicates > 0) parts.push(`${String(counts.duplicates)} already saved`);
  if (counts.invalid > 0) parts.push(`${String(counts.invalid)} invalid`);
  return parts.join(' · ');
}

/** Split typed or pasted text into tokens (commas, semicolons, spaces, newlines). */
export function tokensFromText(text: string): string[] {
  return splitEmailList(text);
}
