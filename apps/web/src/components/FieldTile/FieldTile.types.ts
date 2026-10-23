import type { FieldKind } from '@/types/sealdTypes';

/** The signer a field is assigned to. Only what the tile shows. */
export interface FieldTileSigner {
  readonly name: string;
  /** Signer colour, a `seald.color.signer` entry. Drives the left swatch. */
  readonly color: string;
}

/**
 * Read-only summary of one placed field: kind, owner and required flag.
 * It renders no controls and takes no handlers. Editing stays in PlacedField.
 */
export interface FieldTileProps {
  readonly kind: FieldKind;
  /** `undefined` when the field has no signer yet. */
  readonly signer?: FieldTileSigner | undefined;
  /** Defaults to `true`, matching PlacedField. */
  readonly required?: boolean | undefined;
}
