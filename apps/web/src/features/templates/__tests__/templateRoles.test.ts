import { describe, expect, it } from 'vitest';
import { deriveTemplateRoles, roleColor } from '../templateRoles';

describe('deriveTemplateRoles', () => {
  it('makes one role per saved signer, in order, with the person already chosen', () => {
    const roles = deriveTemplateRoles({
      fields: [],
      lastSigners: [
        { id: 'c1', name: 'Hannah Wills', email: 'hannah@quill.vc', color: '#7DD3FC' },
        { id: 'me:u', name: 'You', email: 'you@seald.app', color: '#F472B6' },
      ],
    });
    expect(roles.map((r) => [r.key, r.label])).toEqual([
      ['c1', 'Signer 1'],
      ['me:u', 'Signer 2'],
    ]);
    expect(roles[0]?.person).toEqual({
      id: 'c1',
      name: 'Hannah Wills',
      email: 'hannah@quill.vc',
      color: '#7DD3FC',
    });
    expect(roles[0]?.color).toBe(roleColor(0));
    expect(roles[1]?.color).toBe(roleColor(1));
    expect(roles[0]?.color).not.toBe(roles[1]?.color);
  });

  it('without a roster, gives a slot for every signer index the fields use (no gaps)', () => {
    const roles = deriveTemplateRoles({
      lastSigners: [],
      fields: [
        { type: 'signature', pageRule: 'last', x: 0, y: 0, signerIndex: 0 },
        { type: 'signature', pageRule: 'last', x: 0, y: 0, signerIndex: 2 },
      ],
    });
    expect(roles.map((r) => r.key)).toEqual(['slot-0', 'slot-1', 'slot-2']);
    expect(roles.every((r) => r.person === null)).toBe(true);
  });

  it('always has at least one role', () => {
    expect(deriveTemplateRoles({ fields: [] }).map((r) => r.key)).toEqual(['slot-0']);
  });

  it('cycles the palette past its end', () => {
    expect(roleColor(0)).toBe(roleColor(6));
  });
});
