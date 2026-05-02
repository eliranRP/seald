import { describe, it, expect } from 'vitest';
import { duplicateTemplate, type TemplateSummary } from './templates';

const BASE: TemplateSummary = {
  id: 'TPL-SOURCE',
  name: 'NDA',
  description: 'A non-disclosure agreement',
  pages: 2,
  fieldCount: 3,
  lastUsed: 'Apr 22',
  uses: 7,
  cover: '#EEF2FF',
  exampleFile: 'nda.pdf',
  fields: [],
  tags: ['Legal'],
};

/**
 * Regression suite for `duplicateTemplate` collision-resistance and
 * field preservation. Surfaced by the QA audit
 * (qa/envelope-templates-break-tests): the previous implementation
 * generated ids from `Math.random().toString(16).slice(2, 6)` — only
 * 16^4 = 65,536 possible values. A user duplicating a template a few
 * hundred times triggered a birthday-paradox collision well above 50%
 * probability, which silently overwrote earlier duplicates in the
 * local module store (templates are keyed by id) and made the visible
 * card disappear.
 */
describe('duplicateTemplate', () => {
  it('returns a card with the "(copy)" suffix and a fresh id distinct from the source', () => {
    const dup = duplicateTemplate(BASE);
    expect(dup.id).not.toBe(BASE.id);
    expect(dup.id.length).toBeGreaterThan(0);
    expect(dup.name).toBe('NDA (copy)');
  });

  it('resets the use telemetry (uses_count + lastUsed) so the copy is treated as brand-new', () => {
    const dup = duplicateTemplate(BASE);
    expect(dup.uses).toBe(0);
    expect(dup.lastUsed).toBe('—');
  });

  it('preserves the source layout — fields, tags, cover, description', () => {
    // Carry-over guarantees the duplicate is actually usable. Without
    // these the duplicate is an empty shell that the editor can't open.
    const fields = [{ type: 'signature', pageRule: 'last', x: 60, y: 540 } as const];
    const dup = duplicateTemplate({ ...BASE, fields });
    expect(dup.fields).toBe(fields);
    expect(dup.tags).toEqual(BASE.tags);
    expect(dup.cover).toBe(BASE.cover);
    expect(dup.description).toBe(BASE.description);
  });

  it('produces unique ids across many calls (no collisions over 5,000 invocations)', () => {
    // Old impl: 65,536 id-space → ~50% collision probability after
    // ~302 calls (birthday paradox). At 5,000 calls the collision
    // probability with the old space was effectively 1.0. The new
    // impl draws from a much larger space (UUID v4 or a 64-bit hex
    // suffix) so duplicates within a run should remain unique.
    const ids = new Set<string>();
    for (let i = 0; i < 5_000; i++) {
      ids.add(duplicateTemplate(BASE).id);
    }
    expect(ids.size).toBe(5_000);
  });
});
