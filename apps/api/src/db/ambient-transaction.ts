import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger } from '@nestjs/common';
import { Kysely, sql, type ControlledTransaction, type Transaction } from 'kysely';

/**
 * Ambient Postgres transactions (parity plan WP-24, MCP step 8a/10).
 *
 * An MCP write must commit its idempotency claim and the write it
 * protects together, so a crash between them can never let a retry run
 * the write a second time. The envelope services and `appendEvent` open
 * their own `db.transaction()` and call each other through repositories,
 * so instead of threading a `trx` argument through every signature, the
 * Kysely instance behind `DB_TOKEN` is wrapped:
 *
 * - Outside {@link runInAmbientTransaction} nothing changes: every call
 *   goes straight to the root Kysely, and each `db.transaction()` is its
 *   own transaction, exactly as before. Every non-MCP caller lives here.
 * - Inside it, every query on the wrapped instance runs on one
 *   transaction (one connection), and a nested `db.transaction()` becomes
 *   a savepoint: its failure rolls back only its own work (so a caught
 *   error, such as appendEvent's hash-chain retry, leaves the outer
 *   transaction usable), while the outer commit or rollback decides for
 *   everything.
 * - {@link runAfterCommit} defers work that must only see committed
 *   rows (the automation matcher) until the outermost commit, and drops
 *   it when that transaction or its savepoint rolls back.
 *
 * The scope is an `AsyncLocalStorage` frame, so it follows the awaited
 * call chain and nothing else. Work started inside the scope that
 * outlives it falls back to the root Kysely once the frame is closed.
 */

interface RootState {
  open: boolean;
  savepoints: number;
}

interface Frame {
  readonly root: RootState;
  readonly trx: ControlledTransaction<unknown>;
  /** Serializes nested savepoints opened at this level. */
  tail: Promise<void>;
  /** After-commit callbacks registered at this level. */
  readonly pending: Array<() => void>;
}

const storage = new AsyncLocalStorage<Frame>();
const log = new Logger('AmbientTransaction');

const ROOT = Symbol('ambient-transaction.root');

/** Methods that only widen or narrow the compile-time table map: their result stays ambient. */
const TABLE_VIEW_METHODS = new Set<PropertyKey>([
  'withTables',
  '$extendTables',
  '$omitTables',
  '$pickTables',
]);

function activeFrame(): Frame | undefined {
  const frame = storage.getStore();
  return frame && frame.root.open ? frame : undefined;
}

/** True while the current async call chain runs inside an open ambient transaction. */
export function isInAmbientTransaction(): boolean {
  return activeFrame() !== undefined;
}

function rootOf<DB>(db: Kysely<DB>): Kysely<DB> {
  const root: unknown = Reflect.get(db, ROOT);
  return root instanceof Kysely ? (root as Kysely<DB>) : db;
}

/**
 * A prototype method bound to its instance (Kysely keeps its state in
 * `#private` fields, which a proxy receiver cannot reach). An own
 * property (a test spy, say) is returned as it is.
 */
function bound(owner: object, prop: PropertyKey): unknown {
  const value: unknown = Reflect.get(owner, prop, owner);
  if (typeof value !== 'function' || Object.prototype.hasOwnProperty.call(owner, prop)) {
    return value;
  }
  return (value as (...a: unknown[]) => unknown).bind(owner);
}

/**
 * Wrap a Kysely so it joins the ambient transaction when one is open.
 * `createDbProvider` applies it to the instance behind `DB_TOKEN`.
 */
export function withAmbientTransactions<DB>(db: Kysely<DB>): Kysely<DB> {
  const target = rootOf(db);
  return new Proxy(target, {
    get(t, prop) {
      if (prop === ROOT) return t;
      if (TABLE_VIEW_METHODS.has(prop)) {
        const method = Reflect.get(t, prop, t) as (...a: unknown[]) => Kysely<unknown>;
        return (...args: unknown[]) => withAmbientTransactions(method.apply(t, args));
      }
      const frame = activeFrame();
      if (!frame) return bound(t, prop);
      if (prop === 'transaction') return () => nestedTransactionBuilder(frame);
      if (prop === 'connection') {
        return () => ({ execute: <R>(fn: (db: unknown) => Promise<R>) => fn(frame.trx) });
      }
      if (prop === 'startTransaction') {
        return () => {
          throw new Error('startTransaction is not supported inside an ambient transaction');
        };
      }
      if (prop === 'destroy') return bound(t, prop);
      return bound(frame.trx, prop);
    },
  });
}

function nestedTransactionBuilder(frame: Frame): unknown {
  const builder = {
    // A savepoint cannot change isolation or access mode; the outer
    // transaction's settings apply.
    setIsolationLevel: () => builder,
    setAccessMode: () => builder,
    execute: <R>(fn: (trx: Transaction<unknown>) => Promise<R>): Promise<R> =>
      runSavepoint(frame, () => fn(frame.trx)),
  };
  return builder;
}

function runSavepoint<R>(frame: Frame, fn: () => Promise<R>): Promise<R> {
  const run = async (): Promise<R> => {
    frame.root.savepoints += 1;
    const name = `ambient_sp_${frame.root.savepoints}`;
    await sql.raw(`savepoint ${name}`).execute(frame.trx);
    const child: Frame = { root: frame.root, trx: frame.trx, tail: Promise.resolve(), pending: [] };
    let result: R;
    try {
      result = await storage.run(child, fn);
    } catch (err) {
      if (frame.root.open) {
        await sql
          .raw(`rollback to savepoint ${name}`)
          .execute(frame.trx)
          .catch(() => undefined);
      }
      throw err;
    }
    await sql.raw(`release savepoint ${name}`).execute(frame.trx);
    frame.pending.push(...child.pending);
    return result;
  };
  const next = frame.tail.then(run, run);
  frame.tail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * Run `fn` inside one Postgres transaction that every query on a wrapped
 * Kysely joins. Nested inside another ambient transaction it becomes a
 * savepoint. Commits when `fn` resolves, rolls back when it throws (and
 * rethrows). After-commit callbacks run once the outermost commit
 * succeeded, outside the frame.
 */
export async function runInAmbientTransaction<DB, R>(
  db: Kysely<DB>,
  fn: () => Promise<R>,
): Promise<R> {
  const open = activeFrame();
  if (open) return runSavepoint(open, fn);

  const trx = (await rootOf(db).startTransaction().execute()) as ControlledTransaction<unknown>;
  const state: RootState = { open: true, savepoints: 0 };
  const frame: Frame = { root: state, trx, tail: Promise.resolve(), pending: [] };
  let result: R;
  try {
    result = await storage.run(frame, fn);
  } catch (err) {
    state.open = false;
    await trx
      .rollback()
      .execute()
      .catch(() => undefined);
    throw err;
  }
  state.open = false;
  try {
    await trx.commit().execute();
  } catch (err) {
    // A failed COMMIT leaves the connection checked out; roll back to release it.
    await trx
      .rollback()
      .execute()
      .catch(() => undefined);
    throw err;
  }
  for (const cb of frame.pending) {
    storage.exit(() => {
      try {
        cb();
      } catch (err) {
        log.error(`after-commit callback failed: ${err instanceof Error ? err.name : typeof err}`);
      }
    });
  }
  return result;
}

/**
 * Run `cb` after the ambient transaction commits, or now when there is
 * none. Dropped if that transaction (or the savepoint it was registered
 * in) rolls back.
 */
export function runAfterCommit(cb: () => void): void {
  const frame = activeFrame();
  if (!frame) {
    cb();
    return;
  }
  frame.pending.push(cb);
}
