import { OTHER_OWNER, err, ok, resetFlags, setFlags } from '../../__tests__/write-harness';
import { callStep, seedTemplate, stepWorld } from '../../contacts/__tests__/step-world';

describe('templates_list', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it("lists this owner's templates with the signers each one needs, never another owner's", async () => {
    const w = stepWorld();
    await seedTemplate(w, {
      title: 'Two signers',
      field_layout: [
        { type: 'signature', pageRule: 'last', x: 10, y: 10, signerRoleId: 'a' },
        { type: 'signature', pageRule: 'last', x: 10, y: 80, signerRoleId: 'b' },
      ],
      last_signers: [
        { id: 'a', name: 'A', email: 'a@example.com', color: '#111111' },
        { id: 'b', name: 'B', email: 'b@example.com', color: '#222222' },
      ],
    });
    await seedTemplate(w, { title: 'Theirs', owner: OTHER_OWNER, field_layout: [] });
    const out = ok(await callStep(w, 'templates_list', {}));
    const items = out['templates'] as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Two signers',
      signer_slots: 2,
      fields: 2,
      uses_count: 0,
      last_used_at: null,
    });
    expect(out['next_cursor']).toBeNull();
  });

  it('needs templates:read and a valid cursor', async () => {
    const w = stepWorld();
    expect(err(await callStep(w, 'templates_list', {}, { scopes: ['contacts:read'] })).slug).toBe(
      'insufficient_scope',
    );
    expect(err(await callStep(w, 'templates_list', { cursor: 'zz' })).slug).toBe('invalid_cursor');
  });
});
