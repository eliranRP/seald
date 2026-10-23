import type { ResolvedTemplateField } from 'shared';
import {
  EDITOR_CANVAS_WIDTH,
  fieldKindOf,
  placementsFromTemplate,
  slotHasSignatureField,
} from '../direct-link-layout';

const LETTER = { width: 612, height: 792 };
const slots = new Map([
  ['a', 'signer-a'],
  ['b', 'signer-b'],
]);

const field = (over: Partial<ResolvedTemplateField>): ResolvedTemplateField => ({
  id: 'f1',
  page: 1,
  type: 'signature',
  x: 56,
  y: 148.4,
  signerRoleId: 'a',
  ...over,
});

describe('placementsFromTemplate', () => {
  it('normalizes editor pixels with the same arithmetic as the web send path', () => {
    const [p] = placementsFromTemplate([field({})], LETTER, slots, { keepMeta: false });
    const canvasHeight = EDITOR_CANVAS_WIDTH * (792 / 612);
    expect(p).toMatchObject({
      signer_id: 'signer-a',
      kind: 'signature',
      page: 1,
      required: true,
      link_id: null,
    });
    expect(p!.x).toBeCloseTo(56 / 560, 4);
    expect(p!.y).toBeCloseTo(148.4 / canvasHeight, 4);
    expect(p!.width).toBeCloseTo(200 / 560, 4);
    expect(p!.height).toBeCloseTo(54 / canvasHeight, 4);
  });

  it('spells initial as initials and keeps link ids', () => {
    const [p] = placementsFromTemplate(
      [field({ type: 'initial', linkId: 'tpl-link-1' })],
      LETTER,
      slots,
      {
        keepMeta: false,
      },
    );
    expect(p).toMatchObject({ kind: 'initials', link_id: 'tpl-link-1' });
    expect(fieldKindOf('initial')).toBe('initials');
    expect(fieldKindOf('date')).toBe('date');
  });

  it('drops fields whose slot is not on the envelope or that have no owner', () => {
    const { signerRoleId: _owner, ...ownerless } = field({ id: 'f2' });
    const out = placementsFromTemplate(
      [field({ signerRoleId: 'gone' }), ownerless, field({ id: 'f3', signerRoleId: 'b' })],
      LETTER,
      slots,
      { keepMeta: false },
    );
    expect(out.map((f) => f.signer_id)).toEqual(['signer-b']);
  });

  it('clamps out-of-page coordinates into 0..1', () => {
    const [p] = placementsFromTemplate([field({ x: 9999, y: -5 })], LETTER, slots, {
      keepMeta: false,
    });
    expect(p!.x).toBe(1);
    expect(p!.y).toBe(0);
  });

  it('carries meta only when asked, and an explicit required wins over meta.required', () => {
    const f = field({ type: 'text', meta: { required: false, label: 'Company' } });
    expect(placementsFromTemplate([f], LETTER, slots, { keepMeta: false })[0]).not.toHaveProperty(
      'meta',
    );
    const kept = placementsFromTemplate([f], LETTER, slots, { keepMeta: true })[0]!;
    expect(kept.meta).toEqual({ required: false, label: 'Company' });
    expect(kept.required).toBe(false);
  });
});

describe('slotHasSignatureField', () => {
  it('needs a signature or initials field owned by the slot', () => {
    const fields = [
      field({ signerRoleId: 'a' }),
      field({ id: 'f2', type: 'date', signerRoleId: 'b' }),
    ];
    expect(slotHasSignatureField(fields, 'a')).toBe(true);
    expect(slotHasSignatureField(fields, 'b')).toBe(false);
    expect(slotHasSignatureField([field({ type: 'initial', signerRoleId: 'b' })], 'b')).toBe(true);
    expect(slotHasSignatureField(fields, 'c')).toBe(false);
  });
});
