import { NotFoundException } from '@nestjs/common';
import { resetFlags, setFlags } from '../../__tests__/write-harness';
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

describe('templates_update', () => {
  beforeEach(() => {
    setFlags();
  });
  afterEach(() => {
    resetFlags();
  });

  it('patches only what was sent', async () => {
    const w = laterWorld();
    w.answers.set('templates.update', template({ title: 'NDA v2' }));
    const out = ok(
      await call(
        w,
        'templates_update',
        write({ template_id: TEMPLATE_ID, title: 'NDA v2', description: null }),
        principal(SCOPES),
      ),
    );
    expect(out).toMatchObject({ template_id: TEMPLATE_ID, title: 'NDA v2' });
    expect(w.calls[0]?.args).toEqual([OWNER, TEMPLATE_ID, { title: 'NDA v2', description: null }]);
  });

  it('needs something to change, and an unknown template is template_not_found', async () => {
    const w = laterWorld();
    const p = principal(SCOPES);
    expect(
      errorOf(await call(w, 'templates_update', write({ template_id: TEMPLATE_ID }), p)).slug,
    ).toBe('validation_error');
    w.answers.set('templates.update', new NotFoundException('template_not_found'));
    expect(
      errorOf(await call(w, 'templates_update', write({ template_id: TEMPLATE_ID, title: 'x' }), p))
        .slug,
    ).toBe('template_not_found');
  });

  it('dry_run reads the template and lists the keys it would change', async () => {
    const w = laterWorld();
    w.answers.set('templates.get', template());
    const out = ok(
      await call(
        w,
        'templates_update',
        dry({ template_id: TEMPLATE_ID, tags: ['a'] }),
        principal(SCOPES),
      ),
    );
    expect(out).toEqual({
      dry_run: true,
      would: { template_id: TEMPLATE_ID, changes: ['tags'] },
    });
    expect(w.calls.map((c) => c.method)).toEqual(['get']);
  });
});
