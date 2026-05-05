import { describe, it, expect } from 'vitest';
import { resolveTemplateFields } from '../templates';
import type { TemplateFieldLayout } from '../templates';

/**
 * Regression: when a template has a multi-page `pageRule`
 * (`'all'` / `'allButLast'`) and is expanded onto a target document,
 * the resulting copies must share a `linkId`. Without it,
 * `useLinkedRemove` (the hook that gates the "delete from all pages or
 * just this one?" dialog) sees N standalone fields and silently deletes
 * a single peer when the user means to delete the whole linked set —
 * and never offers the dialog. Templates were authored as a single
 * record with a `pageRule`, so the link semantics have to be
 * re-introduced at expansion time.
 */
describe('resolveTemplateFields — linked-copy preservation', () => {
  it('assigns a shared linkId to every copy expanded from pageRule="all"', () => {
    const fields: ReadonlyArray<TemplateFieldLayout> = [
      { type: 'signature', x: 100, y: 200, pageRule: 'all' },
    ];
    const out = resolveTemplateFields(fields, 3);
    expect(out).toHaveLength(3);
    const linkIds = out.map((f) => f.linkId);
    expect(linkIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    // All copies share the SAME id — that's what `useLinkedRemove`
    // groups on.
    expect(new Set(linkIds).size).toBe(1);
  });

  it('assigns a shared linkId to every copy expanded from pageRule="allButLast"', () => {
    const fields: ReadonlyArray<TemplateFieldLayout> = [
      { type: 'date', x: 50, y: 50, pageRule: 'allButLast' },
    ];
    const out = resolveTemplateFields(fields, 4);
    expect(out).toHaveLength(3); // 4 pages, all-but-last → 3 copies
    expect(new Set(out.map((f) => f.linkId)).size).toBe(1);
  });

  it('does NOT set a linkId on a single-page rule (no peers to link)', () => {
    const fields: ReadonlyArray<TemplateFieldLayout> = [
      { type: 'text', x: 10, y: 20, pageRule: 'first' },
      { type: 'text', x: 10, y: 30, pageRule: 'last' },
      { type: 'text', x: 10, y: 40, pageRule: 2 },
    ];
    const out = resolveTemplateFields(fields, 3);
    expect(out).toHaveLength(3);
    for (const f of out) expect(f.linkId).toBeUndefined();
  });

  it('mints a fresh linkId per source field — unrelated multi-page fields are NOT linked', () => {
    const fields: ReadonlyArray<TemplateFieldLayout> = [
      { type: 'signature', x: 100, y: 200, pageRule: 'all' },
      { type: 'date', x: 300, y: 400, pageRule: 'all' },
    ];
    const out = resolveTemplateFields(fields, 2);
    expect(out).toHaveLength(4); // 2 sources × 2 pages
    const sigLinks = new Set(out.filter((f) => f.type === 'signature').map((f) => f.linkId));
    const dateLinks = new Set(out.filter((f) => f.type === 'date').map((f) => f.linkId));
    expect(sigLinks.size).toBe(1);
    expect(dateLinks.size).toBe(1);
    // Distinct sources get distinct ids.
    const [sig] = sigLinks;
    const [date] = dateLinks;
    expect(sig).not.toBe(date);
  });
});
