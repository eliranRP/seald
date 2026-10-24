import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import type { ApiTemplateLastSigner } from './templatesApi';
import type { TemplateRole } from './templateRoles';
import type { TemplateFieldLayout, TemplateSummary } from './templates';

export interface RosterUpdate {
  /** True when the people in the slots differ from what the template stores. */
  readonly changed: boolean;
  readonly lastSigners: ReadonlyArray<ApiTemplateLastSigner>;
  /** The layout with `signerRoleId` moved to the new people's ids. */
  readonly fieldLayout: ReadonlyArray<TemplateFieldLayout>;
}

/**
 * After a send, the template remembers who filled each slot so the next use
 * starts with them. A slot's id is also the `signerRoleId` on its fields, so
 * when a slot gets a different person the fields move to that person's id in
 * the same update (all slots at once, so a swap of two people stays correct).
 */
export function rosterAfterUse(
  template: Pick<TemplateSummary, 'lastSigners' | 'fields'>,
  roles: ReadonlyArray<TemplateRole>,
  picks: Readonly<Record<string, AddSignerContact | undefined>>,
): RosterUpdate {
  const saved = template.lastSigners ?? [];
  const idMap = new Map<string, string>();
  let changed = saved.length !== roles.length;
  const lastSigners: ApiTemplateLastSigner[] = [];
  roles.forEach((role, i) => {
    const person = picks[role.key];
    if (!person) return;
    const before = saved[i];
    if (
      !before ||
      before.id !== person.id ||
      before.email !== person.email ||
      before.name !== person.name
    ) {
      changed = true;
    }
    if (before && before.id !== person.id) idMap.set(before.id, person.id);
    lastSigners.push({
      id: person.id,
      name: person.name,
      email: person.email,
      color: person.color,
      ...(before?.signing_order !== undefined ? { signing_order: before.signing_order } : {}),
    });
  });
  const fieldLayout =
    idMap.size === 0
      ? template.fields
      : template.fields.map((f) => {
          const next = f.signerRoleId !== undefined ? idMap.get(f.signerRoleId) : undefined;
          return next === undefined ? f : { ...f, signerRoleId: next };
        });
  return { changed, lastSigners, fieldLayout };
}
