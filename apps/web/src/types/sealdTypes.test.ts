import { describe, it, expect, expectTypeOf } from 'vitest';
import type { Signer, SignerStatus, SignatureValue, FieldKind, SignatureMode } from './sealdTypes';
import { SIGNER_STATUSES, FIELD_KINDS, SIGNATURE_MODES } from './sealdTypes';

describe('sealdTypes', () => {
  it('exports the canonical enum arrays', () => {
    expect(SIGNER_STATUSES).toEqual([
      'awaiting-you',
      'awaiting-others',
      'completed',
      'declined',
      'expired',
      'draft',
    ]);
    expect(FIELD_KINDS).toEqual(['signature', 'initials', 'date', 'text', 'checkbox', 'email']);
    expect(SIGNATURE_MODES).toEqual(['type', 'draw', 'upload']);
  });

  it('Signer shape is readonly with the correct fields', () => {
    expectTypeOf<Signer>().toMatchTypeOf<{
      readonly id: string;
      readonly name: string;
      readonly email: string;
      readonly status: SignerStatus;
    }>();
  });

  it('SignatureValue is a discriminated union keyed on kind', () => {
    const typed: SignatureValue = { kind: 'typed', text: 'Jamie', font: 'caveat' };
    const drawn: SignatureValue = {
      kind: 'drawn',
      pngDataUrl: 'data:image/png;base64,AA',
      strokes: 3,
    };
    const up: SignatureValue = {
      kind: 'upload',
      pngDataUrl: 'data:image/png;base64,AA',
      fileName: 'sig.png',
    };
    expect([typed.kind, drawn.kind, up.kind]).toEqual(['typed', 'drawn', 'upload']);
  });

  it('FieldKind and SignatureMode are the documented literal unions', () => {
    const k: FieldKind = 'signature';
    expect(k).toBe('signature');
    const m: SignatureMode = 'draw';
    expect(m).toBe('draw');
  });
});
