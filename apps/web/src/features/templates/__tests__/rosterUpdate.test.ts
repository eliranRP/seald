import { describe, expect, it } from 'vitest';
import { rosterAfterUse } from '../rosterUpdate';
import { deriveTemplateRoles } from '../templateRoles';
import type { TemplateFieldLayout } from '../templates';

const A = { id: 'a', name: 'Ann', email: 'ann@x.co', color: '#111111' };
const B = { id: 'b', name: 'Bob', email: 'bob@x.co', color: '#222222' };
const C = { id: 'c', name: 'Cy', email: 'cy@x.co', color: '#333333' };

const FIELDS: ReadonlyArray<TemplateFieldLayout> = [
  { type: 'signature', pageRule: 'last', x: 1, y: 1, signerRoleId: 'a' },
  { type: 'date', pageRule: 'last', x: 2, y: 2, signerRoleId: 'b' },
];

function setup(saved: (typeof A)[]) {
  const template = { fields: FIELDS, lastSigners: saved };
  return { template, roles: deriveTemplateRoles(template) };
}

describe('rosterAfterUse', () => {
  it('reports no change when the same people fill the slots', () => {
    const { template, roles } = setup([A, B]);
    const out = rosterAfterUse(template, roles, { a: A, b: B });
    expect(out.changed).toBe(false);
    expect(out.fieldLayout).toBe(template.fields);
    expect(out.lastSigners.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('moves a slot to its new person and re-points that slot’s fields', () => {
    const { template, roles } = setup([A, B]);
    const out = rosterAfterUse(template, roles, { a: C, b: B });
    expect(out.changed).toBe(true);
    expect(out.lastSigners.map((s) => s.id)).toEqual(['c', 'b']);
    expect(out.fieldLayout.map((f) => f.signerRoleId)).toEqual(['c', 'b']);
  });

  it('handles two people swapping slots without mixing up their fields', () => {
    const { template, roles } = setup([A, B]);
    const out = rosterAfterUse(template, roles, { a: B, b: A });
    expect(out.lastSigners.map((s) => s.id)).toEqual(['b', 'a']);
    expect(out.fieldLayout.map((f) => f.signerRoleId)).toEqual(['b', 'a']);
  });

  it('keeps a slot’s signing step', () => {
    const { template, roles } = setup([{ ...A, signing_order: 2 } as typeof A, B]);
    const out = rosterAfterUse(template, roles, { a: C, b: B });
    expect(out.lastSigners[0]).toMatchObject({ id: 'c', signing_order: 2 });
    expect(out.lastSigners[1]?.signing_order).toBeUndefined();
  });

  it('a template with no saved roster remembers the people now chosen', () => {
    const { template, roles } = setup([]);
    const out = rosterAfterUse(template, roles, { 'slot-0': A });
    expect(out.changed).toBe(true);
    expect(out.lastSigners.map((s) => s.id)).toEqual(['a']);
  });

  it('a renamed person counts as a change but keeps the fields where they are', () => {
    const { template, roles } = setup([A, B]);
    const out = rosterAfterUse(template, roles, { a: { ...A, name: 'Ann Lee' }, b: B });
    expect(out.changed).toBe(true);
    expect(out.fieldLayout).toBe(template.fields);
  });
});
