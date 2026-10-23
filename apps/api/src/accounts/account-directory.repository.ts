/**
 * Who an owner id is, for callers that act for a user without the user's
 * Supabase session (an MCP API key carries only the owner id). Reads the
 * Supabase `auth.users` row; never writes it.
 */
export abstract class AccountDirectoryRepository {
  /** The account's email, or null when the row has none (or is gone). */
  abstract findEmail(owner_id: string): Promise<string | null>;
}
