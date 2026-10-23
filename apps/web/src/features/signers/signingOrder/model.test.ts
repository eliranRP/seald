import { describe, expect, it } from 'vitest';
import {
  moveRow,
  reconcileRows,
  setJoinsPrevious,
  stepNumbers,
  stepsOf,
  toSigningOrderRequest,
  type OrderRow,
} from './model';

const rows = (spec: ReadonlyArray<readonly [string, boolean]>): OrderRow[] =>
  spec.map(([id, joinsPrevious]) => ({ id, joinsPrevious }));

describe('signing order model', () => {
  it('groups rows into steps', () => {
    const r = rows([
      ['a', false],
      ['b', true],
      ['c', false],
    ]);
    expect(stepsOf(r)).toEqual([['a', 'b'], ['c']]);
    expect([...stepNumbers(r)]).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('reconcile drops removed signers and appends new ones as their own step', () => {
    const value = {
      sequential: true,
      rows: rows([
        ['a', false],
        ['b', true],
      ]),
    };
    const next = reconcileRows(value, ['b', 'c']);
    expect(next.rows).toEqual([
      { id: 'b', joinsPrevious: false },
      { id: 'c', joinsPrevious: false },
    ]);
    expect(reconcileRows(next, ['b', 'c'])).toBe(next);
  });

  it('moving a row clears a join on the new first row', () => {
    const r = rows([
      ['a', false],
      ['b', true],
      ['c', false],
    ]);
    expect(moveRow(r, 'b', 0).map((x) => [x.id, x.joinsPrevious])).toEqual([
      ['b', false],
      ['a', false],
      ['c', false],
    ]);
    expect(moveRow(r, 'a', 0)).toBe(r);
  });

  it('cannot join the first row to anything above', () => {
    const r = rows([
      ['a', false],
      ['b', false],
    ]);
    expect(setJoinsPrevious(r, 'a', true)).toBe(r);
    expect(setJoinsPrevious(r, 'b', true)[1]?.joinsPrevious).toBe(true);
  });

  it('builds the request from server ids and skips it in any order', () => {
    const ids = new Map([
      ['a', 'sa'],
      ['b', 'sb'],
      ['c', 'sc'],
    ]);
    const value = {
      sequential: true,
      rows: rows([
        ['a', false],
        ['b', true],
        ['c', false],
      ]),
    };
    expect(toSigningOrderRequest(value, ids)).toEqual({
      delivery_mode: 'sequential',
      signers: [
        { signer_id: 'sa', signing_order: 1 },
        { signer_id: 'sb', signing_order: 1 },
        { signer_id: 'sc', signing_order: 2 },
      ],
    });
    expect(toSigningOrderRequest({ ...value, sequential: false }, ids)).toBeNull();
  });
});
