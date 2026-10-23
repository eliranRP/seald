import { NotFoundException } from '@nestjs/common';
import {
  OWNER,
  TEMPLATE_ID,
  call,
  dry,
  errorOf,
  laterWorld,
  ok,
  principal,
  template,
  write,
} from './later-harness';

const SCOPES = ['templates:read', 'templates:write'] as const;

describe('templates_delete', () => {
  it('removes the owner’s template', async () => {
    const w = laterWorld();
    const out = ok(
      await call(w, 'templates_delete', write({ template_id: TEMPLATE_ID }), principal(SCOPES)),
    );
    expect(out).toEqual({ removed: true });
    expect(w.calls[0]).toMatchObject({ method: 'remove', args: [OWNER, TEMPLATE_ID] });
  });

  it('an unknown template is template_not_found', async () => {
    const w = laterWorld();
    w.answers.set('templates.remove', new NotFoundException('template_not_found'));
    expect(
      errorOf(
        await call(w, 'templates_delete', write({ template_id: TEMPLATE_ID }), principal(SCOPES)),
      ).slug,
    ).toBe('template_not_found');
  });

  it('dry_run only checks the template exists', async () => {
    const w = laterWorld();
    w.answers.set('templates.get', template());
    const out = ok(
      await call(w, 'templates_delete', dry({ template_id: TEMPLATE_ID }), principal(SCOPES)),
    );
    expect(out).toEqual({ dry_run: true, would: { template_id: TEMPLATE_ID, removes: true } });
    expect(w.calls.map((c) => c.method)).toEqual(['get']);
  });

  it('needs templates:write', async () => {
    const w = laterWorld();
    expect(
      errorOf(
        await call(
          w,
          'templates_delete',
          write({ template_id: TEMPLATE_ID }),
          principal(['templates:read']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
