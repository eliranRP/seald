import { describe, expect, it } from 'vitest';
import {
  classifyEmails,
  countEmailChips,
  summarizeEmailChips,
  tokensFromText,
} from './classifyEmails';

const EXISTING: ReadonlySet<string> = new Set(['alex@quill.vc']);

describe('classifyEmails', () => {
  it('marks new, saved-duplicate, pasted-duplicate and invalid addresses', () => {
    const chips = classifyEmails(
      ['nora@acme.co', 'Alex@Quill.vc', 'nora@acme.co', 'bad@@acme', 'tom@acme'],
      EXISTING,
    );
    expect(chips.map((c) => [c.email, c.kind, c.duplicateOf])).toEqual([
      ['nora@acme.co', 'new', undefined],
      ['alex@quill.vc', 'duplicate', 'saved'],
      ['nora@acme.co', 'duplicate', 'paste'],
      ['bad@@acme', 'invalid', undefined],
      ['tom@acme', 'invalid', undefined],
    ]);
  });

  it('gives repeated addresses distinct, stable ids', () => {
    const chips = classifyEmails(['a@b.co', 'a@b.co'], EXISTING);
    expect(chips.map((c) => c.id)).toEqual(['a@b.co#0', 'a@b.co#1']);
  });
});

describe('countEmailChips + summarizeEmailChips', () => {
  it('counts each kind and writes the summary line, leaving out zeros', () => {
    const chips = classifyEmails(['a@b.co', 'c@d.co', 'alex@quill.vc', 'x@@y'], EXISTING);
    const counts = countEmailChips(chips);
    expect(counts).toEqual({ added: 2, duplicates: 1, invalid: 1 });
    expect(summarizeEmailChips(counts)).toBe('2 new · 1 already saved · 1 invalid');
    expect(summarizeEmailChips({ added: 3, duplicates: 0, invalid: 0 })).toBe('3 new');
    expect(summarizeEmailChips({ added: 0, duplicates: 0, invalid: 0 })).toBe('');
  });
});

describe('tokensFromText', () => {
  it('splits on commas, semicolons, spaces and newlines and lower-cases', () => {
    expect(tokensFromText('A@b.co, c@d.co;e@f.co\n  g@h.co')).toEqual([
      'a@b.co',
      'c@d.co',
      'e@f.co',
      'g@h.co',
    ]);
    expect(tokensFromText('  ')).toEqual([]);
  });
});
