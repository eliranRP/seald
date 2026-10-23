import { MCP_LIST_LIMIT_DEFAULT, type McpContact } from 'shared';
import type { Contact } from '../../../contacts/contact.entity';
import { McpToolFailure } from '../../tool-errors';
import type { McpToolAnnotations } from '../../tool';

export const CONTACT_READ_ANNOTATIONS: McpToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const CONTACT_WRITE_ANNOTATIONS: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Signer palette stand-ins for a contact made without a colour. */
const DEFAULT_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#8B5CF6'] as const;

/** Same email, same colour: stable without a counter. */
export function defaultColor(email: string): string {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEFAULT_COLORS[h % DEFAULT_COLORS.length] ?? '#6366F1';
}

export function toMcpContact(c: Contact): McpContact {
  return { id: c.id, name: c.name, email: c.email, color: c.color };
}

/** Name order, then email and id, so an offset cursor stays stable between calls. */
export function sortContacts(list: ReadonlyArray<Contact>): Contact[] {
  return [...list].sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'en') ||
      a.email.localeCompare(b.email, 'en') ||
      (a.id < b.id ? -1 : 1),
  );
}

export function encodeOffset(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64url');
}

export function decodeOffset(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      o?: unknown;
    };
    if (typeof parsed.o === 'number' && Number.isInteger(parsed.o) && parsed.o >= 0) {
      return parsed.o;
    }
  } catch {
    // fall through
  }
  throw new McpToolFailure('invalid_cursor');
}

/** One page of `items` from an offset cursor. */
export function pageOf<T>(
  items: readonly T[],
  args: { readonly limit?: number | undefined; readonly cursor?: string | undefined },
): { readonly page: T[]; readonly next_cursor: string | null } {
  const start = decodeOffset(args.cursor);
  const size = args.limit ?? MCP_LIST_LIMIT_DEFAULT;
  const page = items.slice(start, start + size);
  return { page, next_cursor: start + size < items.length ? encodeOffset(start + size) : null };
}
