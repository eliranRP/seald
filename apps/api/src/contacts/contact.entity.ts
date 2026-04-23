/**
 * Pure domain shape of a Contact as exposed by the repository and consumed
 * by the HTTP layer. Timestamps are ISO strings — adapters convert from the
 * DB-native `Date` at the boundary.
 */
export interface Contact {
  readonly id: string;
  readonly owner_id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
  readonly created_at: string;
  readonly updated_at: string;
}
