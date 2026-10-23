import { NotFoundException } from '@nestjs/common';
import { AutomationsDeleteOutputSchema } from 'shared';
import { resetFlags, setFlags } from '../../__tests__/write-harness';
import {
  AUTOMATION_ID,
  OWNER,
  call,
  dryRun,
  errorOf,
  gatedWorld,
  ok,
  principal,
  write,
} from '../../account/__tests__/gated-harness';

describe('automations_delete (WP-45)', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('deletes through AutomationsService.remove, as DELETE /automations/:id', async () => {
    const w = gatedWorld();
    const out = ok(
      await call(
        w,
        'automations_delete',
        write({ automation_id: AUTOMATION_ID }),
        principal(['automations:write']),
      ),
    );
    expect(AutomationsDeleteOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toEqual({ deleted: true, automation_id: AUTOMATION_ID });
    expect(w.actions().map((c) => [c.method, c.args])).toEqual([
      ['remove', [OWNER, AUTOMATION_ID]],
    ]);
    expect(w.requests).toEqual([]);
  });

  it('dry_run reads the recipe and deletes nothing', async () => {
    const w = gatedWorld();
    w.answers.set('automations.get', { id: AUTOMATION_ID });
    const out = ok(
      await call(
        w,
        'automations_delete',
        dryRun({ automation_id: AUTOMATION_ID }),
        principal(['automations:write']),
      ),
    );
    expect(out).toEqual({ dry_run: true, would: { automation_id: AUTOMATION_ID, deletes: true } });
    expect(w.actions()).toEqual([]);
  });

  it('an unknown recipe is automation_not_found; automations:read is not enough', async () => {
    const w = gatedWorld();
    w.answers.set('automations.remove', new NotFoundException('automation_not_found'));
    const p = principal(['automations:write']);
    expect(
      errorOf(await call(w, 'automations_delete', write({ automation_id: AUTOMATION_ID }), p)).slug,
    ).toBe('automation_not_found');
    expect(
      errorOf(
        await call(
          w,
          'automations_delete',
          write({ automation_id: AUTOMATION_ID }),
          principal(['automations:read']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
