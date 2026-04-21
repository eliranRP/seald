import { describe, expect, it } from 'vitest';
import * as Seald from './index';

describe('public barrel', () => {
  it('exports core components', () => {
    expect(Seald.Avatar).toBeDefined();
    expect(Seald.Badge).toBeDefined();
    expect(Seald.Button).toBeDefined();
    expect(Seald.Card).toBeDefined();
    expect(Seald.DocThumb).toBeDefined();
    expect(Seald.Icon).toBeDefined();
    expect(Seald.SignatureField).toBeDefined();
    expect(Seald.SignatureMark).toBeDefined();
    expect(Seald.SignaturePad).toBeDefined();
    expect(Seald.SignerRow).toBeDefined();
    expect(Seald.StatusBadge).toBeDefined();
    expect(Seald.TextField).toBeDefined();
  });

  it('exports hooks and helpers', () => {
    expect(Seald.useSignaturePadValue).toBeDefined();
    expect(Seald.STATUS_BADGE_MAP).toBeDefined();
  });

  it('exports theme and providers', () => {
    expect(Seald.seald).toBeDefined();
    expect(Seald.GlobalStyles).toBeDefined();
    expect(Seald.SealdThemeProvider).toBeDefined();
  });

  it('exports type-level constants', () => {
    expect(Seald.SIGNER_STATUSES).toBeDefined();
    expect(Seald.SIGNATURE_MODES).toBeDefined();
    expect(Seald.FIELD_KINDS).toBeDefined();
  });
});
