import { describe, expect, it } from 'vitest';
import * as Seald from './index';

describe('public barrel', () => {
  it('exports core components as renderable values (function or object)', () => {
    // React components are either plain functions or forwardRef/memo objects.
    // Assert they are truthy and either a function or an object with $$typeof.
    const isComponent = (v: unknown) =>
      typeof v === 'function' || (typeof v === 'object' && v !== null && '$$typeof' in v);

    expect(isComponent(Seald.Avatar)).toBe(true);
    expect(isComponent(Seald.Badge)).toBe(true);
    expect(isComponent(Seald.Button)).toBe(true);
    expect(isComponent(Seald.Card)).toBe(true);
    expect(isComponent(Seald.DocThumb)).toBe(true);
    expect(isComponent(Seald.Icon)).toBe(true);
    expect(isComponent(Seald.SignatureField)).toBe(true);
    expect(isComponent(Seald.SignatureMark)).toBe(true);
    expect(isComponent(Seald.SignaturePad)).toBe(true);
    expect(isComponent(Seald.SignerRow)).toBe(true);
    expect(isComponent(Seald.StatusBadge)).toBe(true);
    expect(isComponent(Seald.TextField)).toBe(true);
  });

  it('exports hooks as functions and STATUS_BADGE_MAP as an object', () => {
    expect(typeof Seald.useSignaturePadValue).toBe('function');
    expect(Seald.STATUS_BADGE_MAP).toBeInstanceOf(Object);
    expect(Object.keys(Seald.STATUS_BADGE_MAP).length).toBeGreaterThan(0);
  });

  it('exports theme object and provider components', () => {
    expect(Seald.seald).toBeInstanceOf(Object);
    expect(Object.keys(Seald.seald).length).toBeGreaterThan(0);
    // GlobalStyles may be a function or a styled-components object
    expect(Seald.GlobalStyles).toBeTruthy();
    expect(Seald.SealdThemeProvider).toBeTruthy();
  });

  it('exports type-level constants as non-empty arrays', () => {
    expect(Array.isArray(Seald.SIGNER_STATUSES)).toBe(true);
    expect(Seald.SIGNER_STATUSES.length).toBeGreaterThan(0);
    expect(Array.isArray(Seald.SIGNATURE_MODES)).toBe(true);
    expect(Seald.SIGNATURE_MODES.length).toBeGreaterThan(0);
    expect(Array.isArray(Seald.FIELD_KINDS)).toBe(true);
    expect(Seald.FIELD_KINDS.length).toBeGreaterThan(0);
  });
});
