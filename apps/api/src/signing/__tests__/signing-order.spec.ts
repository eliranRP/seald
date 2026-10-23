import {
  activeSigningOrder,
  initialInvitees,
  isSignersTurn,
  nextStepInvitees,
  stepOf,
  stepOrders,
  type InviteCandidate,
} from '../signing-order';

const AT = '2026-10-22T10:00:00.000Z';

interface Row {
  id: string;
  signing_order: number;
  signed_at: string | null;
  declined_at: string | null;
  invited_at: string | null;
}

/** `layout[i]` = signers in step i+1. Ids are `s<step>.<n>`. */
function envelopeOf(layout: readonly number[]): Row[] {
  const rows: Row[] = [];
  layout.forEach((count, stepIdx) => {
    for (let n = 1; n <= count; n += 1) {
      rows.push({
        id: `s${stepIdx + 1}.${n}`,
        // Sparse orders on purpose: steps are ranks, not raw values.
        signing_order: (stepIdx + 1) * 10,
        signed_at: null,
        declined_at: null,
        invited_at: null,
      });
    }
  });
  return rows;
}

/** Mirror of what send + each submit do to the rows. */
function send(rows: Row[]): void {
  for (const s of initialInvitees('sequential', rows)) s.invited_at = AT;
}
function submit(rows: Row[], id: string): ReturnType<typeof nextStepInvitees> {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(id);
  row.signed_at = AT;
  const next = nextStepInvitees('sequential', rows);
  for (const s of next?.signers ?? []) s.invited_at = AT;
  return next;
}
const invited = (rows: Row[]) =>
  rows
    .filter((r) => r.invited_at !== null)
    .map((r) => r.id)
    .sort();

describe('signing order rules', () => {
  const layouts: number[][] = [];
  for (let steps = 1; steps <= 3; steps += 1) {
    for (let perStep = 1; perStep <= 3; perStep += 1) {
      layouts.push(Array.from({ length: steps }, () => perStep));
    }
  }
  layouts.push([1, 3, 2], [3, 1], [2, 1, 3]);

  it.each(layouts.map((l) => [l.join('-'), l] as const))(
    'step matrix %s: each step is invited only when the one before it is fully signed',
    (_label, layout) => {
      const rows = envelopeOf(layout);
      expect(stepOrders(rows)).toEqual(layout.map((_, i) => (i + 1) * 10));
      send(rows);
      expect(invited(rows)).toEqual(rows.filter((r) => r.id.startsWith('s1.')).map((r) => r.id));

      layout.forEach((count, stepIdx) => {
        const step = stepIdx + 1;
        for (let n = 1; n <= count; n += 1) {
          const id = `s${step}.${n}`;
          // Only the active step may act; earlier and later steps are not
          // their turn (a signed signer is refused as already_signed anyway).
          for (const r of rows) {
            const turn = isSignersTurn('sequential', rows, r.id);
            expect(turn).toBe(r.id.startsWith(`s${step}.`));
          }
          const next = submit(rows, id);
          const stepDone = n === count;
          const isLast = step === layout.length;
          if (stepDone && !isLast) {
            expect(next).toEqual({
              signingOrder: (step + 1) * 10,
              step: step + 1,
              signers: rows.filter((r) => r.id.startsWith(`s${step + 1}.`)),
            });
          } else {
            expect(next).toBeNull();
          }
          // Nobody beyond the active step is ever invited early.
          const active = activeSigningOrder(rows);
          for (const r of rows) {
            if (active !== null && r.signing_order > active) expect(r.invited_at).toBeNull();
          }
        }
      });
      expect(activeSigningOrder(rows)).toBeNull();
      expect(invited(rows)).toEqual(rows.map((r) => r.id).sort());
    },
  );

  it('a repeated evaluation after the step started invites nobody twice', () => {
    const rows = envelopeOf([1, 2]);
    send(rows);
    expect(submit(rows, 's1.1')?.signers.map((s) => s.id)).toEqual(['s2.1', 's2.2']);
    // A concurrent submit re-running the rule under the lock sees the
    // stamps and reports nothing.
    expect(nextStepInvitees('sequential', rows)).toBeNull();
  });

  it('a decline mid-step stops the walk: no later step becomes open to invite', () => {
    const rows = envelopeOf([2, 2]);
    send(rows);
    submit(rows, 's1.1');
    const decliner = rows.find((r) => r.id === 's1.2')!;
    decliner.declined_at = AT;
    // The pure rule would move on, but the envelope is already terminal:
    // the pg helper checks status first, and the guard refuses everyone.
    const signers: InviteCandidate[] = rows;
    expect(isSignersTurn('sequential', signers, 's1.2')).toBe(false);
    expect(rows.filter((r) => r.id.startsWith('s2.')).every((r) => r.invited_at === null)).toBe(
      true,
    );
  });

  it('parallel mode: everyone is invited at send and it is always their turn', () => {
    const rows = envelopeOf([1, 2, 3]);
    expect(initialInvitees('parallel', rows)).toHaveLength(6);
    expect(rows.every((r) => isSignersTurn('parallel', rows, r.id))).toBe(true);
    expect(nextStepInvitees('parallel', rows)).toBeNull();
  });

  it('steps are dense ranks of signing_order', () => {
    const rows = [
      { id: 'a', signing_order: 7, signed_at: null, declined_at: null },
      { id: 'b', signing_order: 2, signed_at: null, declined_at: null },
      { id: 'c', signing_order: 7, signed_at: null, declined_at: null },
    ];
    expect(stepOf(rows, 2)).toBe(1);
    expect(stepOf(rows, 7)).toBe(2);
    expect(isSignersTurn('sequential', rows, 'missing')).toBe(false);
  });
});
