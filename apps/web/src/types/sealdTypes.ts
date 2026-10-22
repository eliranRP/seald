import type { AnyFieldKind } from 'shared';

export * from 'shared';

/**
 * Editor field kinds (WP-08). Widened to every kind the API knows while
 * `fieldMetaV2` is on. `FIELD_KINDS` (the palette default) stays the legacy
 * six; the four new kinds are added by `paletteFieldKinds()` only when the
 * flag is on, so flag-off surfaces are unchanged. This explicit export wins
 * over the `shared` star export above.
 */
export type FieldKind = AnyFieldKind;
