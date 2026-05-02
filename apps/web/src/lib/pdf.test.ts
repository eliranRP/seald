import { describe, expect, it } from 'vitest';

// Importing the module installs the Map.upsert polyfills as a side effect.
import './pdf';

interface UpsertMap<K, V> extends Map<K, V> {
  getOrInsertComputed?: (key: K, callbackfn: (key: K) => V) => V;
  getOrInsert?: (key: K, value: V) => V;
}

/**
 * Regression for the production bug where pdfjs-dist v5's `page.render()`
 * threw `this[#methodPromises].getOrInsertComputed is not a function`,
 * leaving the canvas blank with the error overflowing into the surrounding
 * UI. The library calls a TC39 stage-3 Map.upsert proposal API that isn't
 * yet shipping in stable browser engines, so `lib/pdf.ts` polyfills it at
 * module load. These tests pin the polyfill in place — if either install
 * goes missing, pdfjs render breaks for every user.
 */
describe('Map.upsert polyfill (pdfjs-dist v5 dependency)', () => {
  it('exposes Map.prototype.getOrInsertComputed after importing lib/pdf', () => {
    const m = new Map<string, number>() as UpsertMap<string, number>;
    expect(typeof m.getOrInsertComputed).toBe('function');
  });

  it('getOrInsertComputed returns existing value when the key is present', () => {
    const m = new Map<string, number>([['a', 1]]) as UpsertMap<string, number>;
    const computed = m.getOrInsertComputed!('a', () => 99);
    expect(computed).toBe(1);
    expect(m.get('a')).toBe(1);
  });

  it('getOrInsertComputed inserts and returns the computed value when missing', () => {
    const m = new Map<string, number>() as UpsertMap<string, number>;
    const computed = m.getOrInsertComputed!('b', (k) => (k === 'b' ? 42 : -1));
    expect(computed).toBe(42);
    expect(m.get('b')).toBe(42);
  });

  it('exposes Map.prototype.getOrInsert with insert-on-miss semantics', () => {
    const m = new Map<string, number>([['x', 1]]) as UpsertMap<string, number>;
    expect(typeof m.getOrInsert).toBe('function');
    expect(m.getOrInsert!('x', 99)).toBe(1);
    expect(m.getOrInsert!('y', 7)).toBe(7);
    expect(m.get('y')).toBe(7);
  });

  it('also installs the polyfill on WeakMap.prototype (pdfjs hits both)', () => {
    interface UpsertWeakMap<K extends object, V> extends WeakMap<K, V> {
      getOrInsertComputed?: (key: K, callbackfn: (key: K) => V) => V;
      getOrInsert?: (key: K, value: V) => V;
    }
    const wm = new WeakMap<object, number>() as UpsertWeakMap<object, number>;
    expect(typeof wm.getOrInsertComputed).toBe('function');
    expect(typeof wm.getOrInsert).toBe('function');
    const k1 = {};
    const k2 = {};
    expect(wm.getOrInsertComputed!(k1, () => 5)).toBe(5);
    expect(wm.getOrInsertComputed!(k1, () => 99)).toBe(5); // already present
    expect(wm.getOrInsert!(k2, 7)).toBe(7);
    expect(wm.getOrInsert!(k2, 999)).toBe(7); // already present
  });
});
