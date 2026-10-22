import { afterEach, describe, expect, it } from 'vitest';
import { parseFieldMeta } from 'shared';
import {
  defaultFieldMeta,
  draftFromMeta,
  metaFromDraft,
  newOption,
  placementMeta,
  type MetaDraft,
} from './fieldMetaForm';
import { paletteFieldKinds } from './paletteFieldKinds';

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };
const setFlag = (on: boolean): void => {
  (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { fieldMetaV2: on };
};
afterEach(() => {
  delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
});

const blank = draftFromMeta('text', undefined);
const draft = (patch: Partial<MetaDraft>): MetaDraft => ({ ...blank, ...patch });

describe('metaFromDraft', () => {
  it('yields an empty meta for an untouched draft', () => {
    expect(metaFromDraft('text', blank)).toEqual({ ok: true, meta: {} });
  });

  it('builds text meta the API schema accepts', () => {
    const result = metaFromDraft(
      'text',
      draft({ label: 'Job title', charLimit: '40', defaultValue: 'Engineer', fontSize: '12' }),
    );
    expect(result).toEqual({
      ok: true,
      meta: { label: 'Job title', char_limit: 40, default: 'Engineer', font_size: 12 },
    });
    if (result.ok) expect(parseFieldMeta('text', result.meta).ok).toBe(true);
  });

  it('rejects a default longer than the character limit', () => {
    const result = metaFromDraft('text', draft({ charLimit: '3', defaultValue: 'abcd' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.fields.defaultValue).toMatch(/longer/i);
  });

  it('flags a font size outside 8 to 96', () => {
    const result = metaFromDraft('text', draft({ fontSize: '4' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.fields.fontSize).toMatch(/8 to 96/);
  });

  it('builds number meta with min, max, format and default', () => {
    const result = metaFromDraft(
      'number',
      draft({ min: '1', max: '10', format: 'fixed2', defaultValue: '5' }),
    );
    expect(result).toEqual({
      ok: true,
      meta: { min: 1, max: 10, format: 'fixed2', default: 5 },
    });
  });

  it('flags min above max and a default out of range', () => {
    const swapped = metaFromDraft('number', draft({ min: '9', max: '2' }));
    expect(swapped.ok).toBe(false);
    if (!swapped.ok) expect(swapped.errors.fields.min).toMatch(/greater than/i);
    const outside = metaFromDraft('number', draft({ min: '1', max: '3', defaultValue: '7' }));
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.errors.fields.defaultValue).toMatch(/between/i);
  });

  it('flags a bound that is not a number', () => {
    const result = metaFromDraft('number', draft({ min: 'abc' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.fields.min).toBe('Enter a number.');
  });

  it('flags duplicate option values and empty labels per row', () => {
    const a = { id: 'a', label: 'One', value: 'x' };
    const b = { id: 'b', label: '', value: 'x' };
    const result = metaFromDraft('radio', draft({ options: [a, b] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.options['b']).toEqual({
        label: 'Enter a label.',
        value: 'Values must be unique.',
      });
      expect(result.errors.options['a']).toBeUndefined();
    }
  });

  it('requires at least one option', () => {
    const result = metaFromDraft('dropdown', draft({ options: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.fields.options).toMatch(/at least one/i);
  });

  it('accepts a default that is one of the options and rejects one that is not', () => {
    const options = [
      { id: 'a', label: 'One', value: '1' },
      { id: 'b', label: 'Two', value: '2' },
    ];
    expect(metaFromDraft('radio', draft({ options, defaultValue: '2' }))).toEqual({
      ok: true,
      meta: {
        options: [
          { label: 'One', value: '1' },
          { label: 'Two', value: '2' },
        ],
        default: '2',
      },
    });
    const bad = metaFromDraft('radio', draft({ options, defaultValue: '3' }));
    expect(bad.ok).toBe(false);
  });

  it('needs a default for a read-only field', () => {
    const result = metaFromDraft('text', draft({ readOnly: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.fields.readOnly).toMatch(/default/i);
    expect(metaFromDraft('text', draft({ readOnly: true, defaultValue: 'x' }))).toEqual({
      ok: true,
      meta: { read_only: true, default: 'x' },
    });
  });

  it('keeps a `required` the draft does not edit', () => {
    expect(metaFromDraft('text', blank, { required: false })).toEqual({
      ok: true,
      meta: { required: false },
    });
  });
});

describe('draftFromMeta', () => {
  it('round-trips radio meta', () => {
    const meta = { options: [{ label: 'A', value: 'a' }], default: 'a', label: 'Pick' };
    const result = metaFromDraft('radio', draftFromMeta('radio', meta));
    expect(result).toEqual({ ok: true, meta });
  });
});

describe('newOption', () => {
  it('never reuses a value that exists', () => {
    const existing = [{ id: 'a', label: 'x', value: 'option-2' }];
    expect(newOption(existing).value).toBe('option-3');
  });
});

describe('flag-gated helpers', () => {
  it('starts radio and dropdown with two options only while the flag is on', () => {
    setFlag(false);
    expect(defaultFieldMeta('radio')).toBeUndefined();
    setFlag(true);
    const meta = defaultFieldMeta('dropdown');
    expect(meta).toBeDefined();
    expect(parseFieldMeta('dropdown', meta).ok).toBe(true);
    expect(defaultFieldMeta('text')).toBeUndefined();
  });

  it('offers the legacy six kinds off and ten on', () => {
    setFlag(false);
    expect(paletteFieldKinds()).toEqual([
      'signature',
      'initials',
      'date',
      'text',
      'checkbox',
      'email',
    ]);
    setFlag(true);
    expect(paletteFieldKinds()).toEqual([
      'signature',
      'initials',
      'date',
      'text',
      'checkbox',
      'email',
      'name',
      'number',
      'radio',
      'dropdown',
    ]);
  });

  it('adds meta to a placement only while the flag is on', () => {
    setFlag(false);
    expect(placementMeta({ meta: { label: 'x' } })).toEqual({});
    setFlag(true);
    expect(placementMeta({ meta: { label: 'x' } })).toEqual({ meta: { label: 'x' } });
    expect(placementMeta({})).toEqual({});
  });
});
