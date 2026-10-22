import { MAX_SIGNING_ORDER } from 'shared';

/**
 * Signing order for a draft (WP-06, flag `signingOrder`). Every recipient is a
 * signer. In order, signers are listed top to bottom; a row that "joins the
 * step above" signs at the same time as the row before it, so a step is a run
 * of rows. Rows are addressed by signer id, never by index (rule 4.3).
 */
export interface OrderRow {
  readonly id: string;
  /** True when this signer shares the previous row's step. Never true on row 0. */
  readonly joinsPrevious: boolean;
}

export interface SigningOrderValue {
  /** False means "in any order": everyone is invited at once. */
  readonly sequential: boolean;
  readonly rows: ReadonlyArray<OrderRow>;
}

export const DEFAULT_SIGNING_ORDER: SigningOrderValue = { sequential: false, rows: [] };

function normalize(rows: ReadonlyArray<OrderRow>): OrderRow[] {
  return rows.map((r, i) => (i === 0 && r.joinsPrevious ? { ...r, joinsPrevious: false } : r));
}

/**
 * Keeps rows in step with the current signers: drops ones that left and
 * appends new ones as their own last step. Returns the same object when
 * nothing changed so effects do not loop.
 */
export function reconcileRows(
  value: SigningOrderValue,
  signerIds: ReadonlyArray<string>,
): SigningOrderValue {
  const present = new Set(signerIds);
  const kept = value.rows.filter((r) => present.has(r.id));
  const known = new Set(kept.map((r) => r.id));
  const added = signerIds
    .filter((id) => !known.has(id))
    .map((id) => ({ id, joinsPrevious: false }));
  if (kept.length === value.rows.length && added.length === 0) return value;
  return { ...value, rows: normalize([...kept, ...added]) };
}

/** Rows grouped into steps, in order. */
export function stepsOf(rows: ReadonlyArray<OrderRow>): string[][] {
  const steps: string[][] = [];
  for (const row of rows) {
    const last = steps[steps.length - 1];
    if (row.joinsPrevious && last !== undefined) last.push(row.id);
    else steps.push([row.id]);
  }
  return steps;
}

/** 1-based step number of every signer id. */
export function stepNumbers(rows: ReadonlyArray<OrderRow>): Map<string, number> {
  const out = new Map<string, number>();
  stepsOf(rows).forEach((ids, i) => {
    for (const id of ids) out.set(id, i + 1);
  });
  return out;
}

export function moveRow(
  rows: ReadonlyArray<OrderRow>,
  id: string,
  toIndex: number,
): ReadonlyArray<OrderRow> {
  const from = rows.findIndex((r) => r.id === id);
  if (from < 0) return rows;
  const to = Math.max(0, Math.min(rows.length - 1, toIndex));
  if (to === from) return rows;
  const next = [...rows];
  const [item] = next.splice(from, 1);
  if (item === undefined) return rows;
  next.splice(to, 0, item);
  return normalize(next);
}

export function setJoinsPrevious(
  rows: ReadonlyArray<OrderRow>,
  id: string,
  joins: boolean,
): ReadonlyArray<OrderRow> {
  const index = rows.findIndex((r) => r.id === id);
  if (index <= 0) return rows;
  return rows.map((r) => (r.id === id ? { ...r, joinsPrevious: joins } : r));
}

export interface SigningOrderRequestBody {
  readonly delivery_mode: 'sequential';
  readonly signers: ReadonlyArray<{ readonly signer_id: string; readonly signing_order: number }>;
}

/**
 * Body for `PUT /envelopes/:id/signing-order`, or null when the draft stays
 * in any order (no call is needed: a new draft is already parallel).
 * `serverIds` maps editor ids to the ids the server assigned.
 */
export function toSigningOrderRequest(
  value: SigningOrderValue,
  serverIds: ReadonlyMap<string, string>,
): SigningOrderRequestBody | null {
  if (!value.sequential || value.rows.length < 2) return null;
  const numbers = stepNumbers(value.rows);
  const signers: { signer_id: string; signing_order: number }[] = [];
  for (const row of value.rows) {
    const serverId = serverIds.get(row.id);
    const step = numbers.get(row.id);
    if (serverId === undefined || step === undefined) continue;
    signers.push({ signer_id: serverId, signing_order: Math.min(step, MAX_SIGNING_ORDER) });
  }
  return { delivery_mode: 'sequential', signers };
}
