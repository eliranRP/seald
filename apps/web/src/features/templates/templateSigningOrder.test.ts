import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  signingOrderFromTemplate,
  templateDeliveryMode,
  useSeedSigningOrderFromTemplate,
  withTemplateSigningOrder,
} from './templateSigningOrder';
import type { TemplateSummary } from './templates';

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };
const setFlag = (on: boolean): void => {
  (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { signingOrder: on };
};
afterEach(() => {
  delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
});

const signer = (id: string, signing_order?: number) => ({
  id,
  name: id,
  email: `${id}@example.com`,
  color: '#112233',
  ...(signing_order !== undefined ? { signing_order } : {}),
});

describe('signingOrderFromTemplate', () => {
  it('is any order for a parallel template, however the slots are numbered', () => {
    expect(
      signingOrderFromTemplate({
        deliveryMode: 'parallel',
        lastSigners: [signer('a', 1), signer('b', 2)],
      }),
    ).toEqual({ sequential: false, rows: [] });
    expect(signingOrderFromTemplate({ lastSigners: [signer('a'), signer('b')] }).sequential).toBe(
      false,
    );
  });

  it('turns slot numbers into rows, joining slots that share a step', () => {
    const value = signingOrderFromTemplate({
      deliveryMode: 'sequential',
      lastSigners: [signer('c', 2), signer('a', 1), signer('b', 1)],
    });
    expect(value).toEqual({
      sequential: true,
      rows: [
        { id: 'a', joinsPrevious: false },
        { id: 'b', joinsPrevious: true },
        { id: 'c', joinsPrevious: false },
      ],
    });
  });

  it('falls back to the saved order for slots without a number', () => {
    const value = signingOrderFromTemplate({
      deliveryMode: 'sequential',
      lastSigners: [signer('a'), signer('b'), signer('c')],
    });
    expect(value.rows.map((r) => [r.id, r.joinsPrevious])).toEqual([
      ['a', false],
      ['b', false],
      ['c', false],
    ]);
  });

  it('needs two slots to order', () => {
    expect(
      signingOrderFromTemplate({ deliveryMode: 'sequential', lastSigners: [signer('a', 1)] })
        .sequential,
    ).toBe(false);
  });
});

describe('saving the order', () => {
  const sequential = {
    sequential: true,
    rows: [
      { id: 'a', joinsPrevious: false },
      { id: 'b', joinsPrevious: true },
      { id: 'c', joinsPrevious: false },
    ],
  } as const;

  it('does nothing while signingOrder is off', () => {
    setFlag(false);
    expect(templateDeliveryMode(sequential)).toEqual({});
    const signers = [signer('a'), signer('b'), signer('c')];
    expect(withTemplateSigningOrder(signers, sequential)).toBe(signers);
  });

  it('saves sequential with a step number per slot', () => {
    setFlag(true);
    expect(templateDeliveryMode(sequential)).toEqual({ delivery_mode: 'sequential' });
    const out = withTemplateSigningOrder([signer('a'), signer('b'), signer('c')], sequential);
    expect(out.map((s) => [s.id, s.signing_order])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('saves parallel for any order and leaves slots without a number', () => {
    setFlag(true);
    expect(templateDeliveryMode({ sequential: false, rows: [] })).toEqual({
      delivery_mode: 'parallel',
    });
    const signers = [signer('a')];
    expect(withTemplateSigningOrder(signers, { sequential: false, rows: [] })).toBe(signers);
  });

  it('keeps slots the editor does not list as they were', () => {
    setFlag(true);
    const out = withTemplateSigningOrder([signer('a'), signer('z', 9)], sequential);
    expect(out.find((s) => s.id === 'z')?.signing_order).toBe(9);
  });
});

describe('useSeedSigningOrderFromTemplate', () => {
  const template = (id: string, mode: 'parallel' | 'sequential'): TemplateSummary => ({
    id,
    name: 'T',
    pages: 1,
    fieldCount: 0,
    lastUsed: '—',
    uses: 0,
    cover: '#fff',
    exampleFile: '',
    fields: [],
    deliveryMode: mode,
    lastSigners: [signer('a', 1), signer('b', 2)],
  });

  it('seeds once per template when the flag is on', () => {
    setFlag(true);
    const setValue = vi.fn();
    const { rerender } = renderHook(
      ({ t }: { t: TemplateSummary | undefined }) => {
        useSeedSigningOrderFromTemplate(t, setValue);
      },
      { initialProps: { t: undefined as TemplateSummary | undefined } },
    );
    expect(setValue).not.toHaveBeenCalled();
    rerender({ t: template('t1', 'sequential') });
    expect(setValue).toHaveBeenCalledTimes(1);
    rerender({ t: { ...template('t1', 'sequential'), name: 'renamed' } });
    expect(setValue).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the flag is off, or for a parallel template', () => {
    setFlag(false);
    const off = vi.fn();
    renderHook(() => {
      useSeedSigningOrderFromTemplate(template('t1', 'sequential'), off);
    });
    expect(off).not.toHaveBeenCalled();
    setFlag(true);
    const parallel = vi.fn();
    renderHook(() => {
      useSeedSigningOrderFromTemplate(template('t2', 'parallel'), parallel);
    });
    expect(parallel).not.toHaveBeenCalled();
  });
});
