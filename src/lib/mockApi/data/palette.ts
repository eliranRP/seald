/**
 * Canonical color palette used when auto-assigning a color to a freshly created
 * signer. Lives in the mock API data layer because:
 *   1. The seed contact/document fixtures in `contacts.ts` / `documents.ts`
 *      reference these exact hex values as their `color` field.
 *   2. The production server that eventually replaces the mock would be the
 *      authority for signer colors (or at least the default assignment).
 *
 * Exported so providers can use the same palette for `nextColor()` lookups
 * when a contact is added locally in between server syncs.
 */
export const SIGNER_COLOR_PALETTE = [
  '#F472B6',
  '#7DD3FC',
  '#10B981',
  '#F59E0B',
  '#818CF8',
] as const;

export type SignerColor = (typeof SIGNER_COLOR_PALETTE)[number];
