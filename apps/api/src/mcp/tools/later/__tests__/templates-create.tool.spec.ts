import { McpTemplateSchema } from 'shared';
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

const layout = [
  { type: 'signature', pageRule: 'last', x: 100, y: 600, signerRoleId: 's1' },
  { type: 'initial', pageRule: 'allButLast', x: 500, y: 700 },
];

describe('templates_create', () => {
  beforeEach(() => {
    setFlags();
  });
  afterEach(() => {
    resetFlags();
  });

  it('creates through TemplatesService with only the keys sent', async () => {
    const w = laterWorld();
    w.answers.set('templates.create', template());
    const out = ok(
      await call(
        w,
        'templates_create',
        write({ title: ' NDA ', field_layout: layout, tags: ['legal'] }),
        principal(SCOPES),
      ),
    );
    expect(McpTemplateSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({
      template_id: TEMPLATE_ID,
      title: 'NDA',
      fields: 2,
      signer_slots: 1,
      has_example_pdf: false,
    });
    const [c] = w.calls;
    expect(c?.args[0]).toBe(OWNER);
    expect(c?.args[1]).toEqual({
      title: 'NDA',
      field_layout: layout,
      tags: ['legal'],
    });
  });

  it('refuses an unknown field type, an envelope-spelling kind and an empty title', async () => {
    const w = laterWorld();
    const p = principal(SCOPES);
    for (const bad of [
      { title: 'NDA', field_layout: [{ type: 'initials', pageRule: 1, x: 1, y: 1 }] },
      { title: 'NDA', field_layout: [{ type: 'signature', pageRule: 0, x: 1, y: 1 }] },
      { title: ' ', field_layout: [] },
    ]) {
      expect(errorOf(await call(w, 'templates_create', write(bad), p)).slug).toBe(
        'validation_error',
      );
    }
    expect(w.calls).toEqual([]);
  });

  it('refuses delivery_mode and signing_order while signingOrder is off', async () => {
    setFlags({ signingOrder: false });
    const w = laterWorld();
    const p = principal(SCOPES);
    expect(
      errorOf(
        await call(
          w,
          'templates_create',
          write({ title: 'NDA', field_layout: layout, delivery_mode: 'sequential' }),
          p,
        ),
      ).slug,
    ).toBe('validation_error');
    expect(w.calls).toEqual([]);
  });

  it('dry_run writes nothing and needs templates:write', async () => {
    const w = laterWorld();
    const out = ok(
      await call(
        w,
        'templates_create',
        dry({ title: 'NDA', field_layout: layout }),
        principal(SCOPES),
      ),
    );
    expect(out).toEqual({ dry_run: true, would: { title: 'NDA', fields: 2, last_signers: 0 } });
    expect(w.calls).toEqual([]);
    expect(
      errorOf(
        await call(
          w,
          'templates_create',
          write({ title: 'NDA', field_layout: layout }),
          principal(['templates:read']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
