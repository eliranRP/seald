import type { ColumnType, Generated } from 'kysely';

export interface Database {
  contacts: ContactsTable;
}

export interface ContactsTable {
  id: Generated<string>;
  owner_id: string;
  name: string;
  email: string;
  color: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}
