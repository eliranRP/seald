import { FIELD_KINDS, NEW_FIELD_KINDS, isFeatureEnabled } from 'shared';
import type { FieldKind } from '@/types/sealdTypes';

/**
 * Field kinds the editor palette offers. The legacy six while `fieldMetaV2`
 * is off; plus name, number, radio and dropdown when it is on.
 */
export function paletteFieldKinds(): ReadonlyArray<FieldKind> {
  return isFeatureEnabled('fieldMetaV2') ? [...FIELD_KINDS, ...NEW_FIELD_KINDS] : FIELD_KINDS;
}
