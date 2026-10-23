import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { runInAmbientTransaction } from './ambient-transaction';
import { DB_TOKEN } from './db.provider';

/**
 * Runs a unit of work in one database transaction that every repository
 * on `DB_TOKEN` joins (see `ambient-transaction.ts`). Nested calls become
 * savepoints. Used where a write and its bookkeeping must commit together:
 * the MCP idempotency claim with the write it protects, and an approval
 * decision with the action it runs.
 */
export abstract class TransactionRunner {
  abstract run<T>(fn: () => Promise<T>): Promise<T>;
}

@Injectable()
export class AmbientTransactionRunner extends TransactionRunner {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    return runInAmbientTransaction(this.db, fn);
  }
}

/**
 * No transaction: for tests and setups whose repositories are in memory
 * (there is no database to roll back). e2e specs that boot `AppModule`
 * with in-memory repositories override `TransactionRunner` with it.
 */
export class PassthroughTransactionRunner extends TransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}
