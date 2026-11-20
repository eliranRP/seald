import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENVELOPE_MACHINE,
  ENVELOPE_STATUSES,
  IllegalTransitionError,
  MCP_ENVELOPE_ALLOWED_ACTIONS,
  SEAL_JOB_MACHINE,
  SIGNER_MACHINE,
  STATE_MACHINES,
  defineMachine,
  ownerEnvelopeActions,
  signerStatusOf,
  toMarkdown,
} from 'shared';

/**
 * The declared lifecycles in `packages/shared/src/state-machines/`.
 * `docs/state-machines.md` is generated from them; regenerate with
 *
 *   UPDATE_STATE_MACHINE_DOCS=1 pnpm --filter api test -- state-machines
 */
const DOC = join(__dirname, '..', '..', '..', '..', 'docs', 'state-machines.md');

const HEADER = `# State machines

<!-- Generated from packages/shared/src/state-machines/ by
     apps/api/src/__tests__/state-machines.spec.ts. Do not edit by hand:
     change the machine, then run
     UPDATE_STATE_MACHINE_DOCS=1 pnpm --filter api test -- state-machines -->

Every persisted lifecycle in seald is declared once, in
\`packages/shared/src/state-machines/\`, and code asks the machine instead of
comparing status strings:

- **Writes** guard on the declared source states:
  \`.where('status', 'in', ENVELOPE_MACHINE.sources('cancel'))\`. The
  row-conditional UPDATE is still the concurrency guard; the machine is the
  single place that says which rows qualify.
- **Gates** read \`ENVELOPE_MACHINE.can(status, event)\` for a transition and
  \`ENVELOPE_MACHINE.allows(status, action)\` for a status-gated action (edit a
  draft, remind, download the sealed PDF).
- **The SPA** shows only the actions \`ownerEnvelopeActions(status)\` returns.
- **Agents** get the same list as \`allowed_actions\` (and \`terminal\`) from the
  MCP tool \`envelopes_status\`.

Adding a state or an edge: change the machine, run the command above, and
let typecheck point at every \`switch\` that must handle it. \`defineMachine\`
refuses an unknown state, an edge out of a terminal state and an
unreachable state when the module loads.
`;

function renderDoc(): string {
  return `${HEADER}\n${STATE_MACHINES.map((m) => toMarkdown(m)).join('\n\n')}\n`;
}

describe('state machines', () => {
  it('docs/state-machines.md matches the declared machines', () => {
    const doc = renderDoc();
    if (process.env.UPDATE_STATE_MACHINE_DOCS === '1') writeFileSync(DOC, doc);
    expect(readFileSync(DOC, 'utf8')).toBe(doc);
  });

  it('ids are unique', () => {
    const ids = STATE_MACHINES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('defineMachine', () => {
    const base = {
      id: 't',
      storedIn: 't.status',
      description: 'test',
      states: ['a', 'b', 'c'],
      initial: 'a',
      terminal: ['c'],
    } as const;

    it('refuses an edge out of a terminal state', () => {
      expect(() =>
        defineMachine({
          ...base,
          transitions: {
            go: { from: ['a'], to: 'b', description: '' },
            end: { from: ['b'], to: 'c', description: '' },
            back: { from: ['c'], to: 'a', description: '' },
          },
        }),
      ).toThrow(/leaves terminal state "c"/);
    });

    it('refuses an unreachable state', () => {
      expect(() =>
        defineMachine({
          ...base,
          transitions: { end: { from: ['a'], to: 'c', description: '' } },
        }),
      ).toThrow(/state "b" is unreachable/);
    });

    it('answers unknown states with false instead of throwing', () => {
      expect(ENVELOPE_MACHINE.can('bogus', 'send')).toBe(false);
      expect(ENVELOPE_MACHINE.allows('bogus', 'remind')).toBe(false);
      expect(ENVELOPE_MACHINE.isState('bogus')).toBe(false);
      expect(ENVELOPE_MACHINE.isState('draft')).toBe(true);
    });
  });

  describe('ENVELOPE_MACHINE', () => {
    it('declares the wire statuses in contract order', () => {
      expect(ENVELOPE_MACHINE.states).toEqual(ENVELOPE_STATUSES);
    });

    it('pins every edge (a change here is a product decision)', () => {
      const edges = Object.entries(ENVELOPE_MACHINE.transitions).flatMap(([event, t]) =>
        t.from.map((from) => `${from} -${event}-> ${t.to}`),
      );
      expect(edges).toEqual([
        'draft -send-> awaiting_others',
        'awaiting_others -unsend-> draft',
        'awaiting_others -all_signed-> sealing',
        'sealing -sealed-> completed',
        'awaiting_others -decline-> declined',
        'awaiting_others -expire-> expired',
        'awaiting_others -cancel-> canceled',
        'sealing -cancel-> canceled',
      ]);
    });

    it('transition() returns the target or throws IllegalTransitionError', () => {
      expect(ENVELOPE_MACHINE.transition('draft', 'send')).toBe('awaiting_others');
      expect(() => ENVELOPE_MACHINE.transition('completed', 'cancel')).toThrow(
        IllegalTransitionError,
      );
      expect(ENVELOPE_MACHINE.next('declined', 'expire')).toBeNull();
    });

    it('owner actions per status', () => {
      expect(ownerEnvelopeActions('draft')).toEqual([
        'send',
        'tag',
        'archive',
        'edit_draft',
        'delete',
        'toggle_reminders',
      ]);
      expect(ownerEnvelopeActions('awaiting_others')).toEqual([
        'unsend',
        'cancel',
        'tag',
        'archive',
        'toggle_reminders',
        'extend_expiry',
        'remind',
        'correct_signer',
      ]);
      expect(ownerEnvelopeActions('sealing')).toEqual(['cancel', 'tag', 'archive']);
      expect(ownerEnvelopeActions('completed')).toEqual(['tag', 'archive', 'download_sealed']);
      for (const stopped of ['declined', 'expired', 'canceled']) {
        expect(ownerEnvelopeActions(stopped)).toEqual(['tag', 'archive', 'download_declined_copy']);
      }
    });

    it('every owner action is on the MCP allowed_actions enum', () => {
      for (const s of ENVELOPE_MACHINE.states) {
        for (const a of ownerEnvelopeActions(s)) expect(MCP_ENVELOPE_ALLOWED_ACTIONS).toContain(a);
      }
    });
  });

  describe('SIGNER_MACHINE / signerStatusOf', () => {
    const stamps = { viewed_at: null, signed_at: null, declined_at: null };
    it('derives with precedence declined > completed > bounced > viewing > awaiting', () => {
      const t = '2026-01-01T00:00:00.000Z';
      expect(signerStatusOf(stamps)).toBe('awaiting');
      expect(signerStatusOf({ ...stamps, viewed_at: t })).toBe('viewing');
      expect(signerStatusOf({ ...stamps, viewed_at: t, delivery_status: 'bounced' })).toBe(
        'bounced',
      );
      expect(signerStatusOf({ ...stamps, signed_at: t, delivery_status: 'bounced' })).toBe(
        'completed',
      );
      expect(signerStatusOf({ ...stamps, declined_at: t, signed_at: t })).toBe('declined');
    });

    it('a signer who acted is terminal', () => {
      expect(SIGNER_MACHINE.isTerminal('completed')).toBe(true);
      expect(SIGNER_MACHINE.isTerminal('declined')).toBe(true);
      expect(SIGNER_MACHINE.can('completed', 'decline')).toBe(false);
    });
  });

  describe('SEAL_JOB_MACHINE', () => {
    it('only a running job finishes, retries or gives up', () => {
      for (const e of ['finish', 'retry', 'give_up', 'yield'] as const) {
        expect(SEAL_JOB_MACHINE.sources(e)).toEqual(['running']);
      }
    });
  });
});
