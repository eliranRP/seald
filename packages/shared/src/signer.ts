export const SIGNER_STATUSES = [
  'awaiting-you',
  'awaiting-others',
  'completed',
  'declined',
  'expired',
  'draft',
] as const;
export type SignerStatus = (typeof SIGNER_STATUSES)[number];

export const FIELD_KINDS = ['signature', 'initials', 'date', 'text', 'checkbox', 'email'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/**
 * Send rule: a signer is covered only by a required signature or a
 * required initials field. Optional signatures do not count, and `name`
 * (stored as text) does not count. `EnvelopesService.send` and placement
 * validation both use this set.
 */
export function signerIdsWithRequiredSignature(
  fields: readonly {
    readonly signer_id: string;
    readonly kind: string;
    readonly required: boolean;
  }[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const field of fields) {
    if (!field.required) continue;
    if (field.kind !== 'signature' && field.kind !== 'initials') continue;
    ids.add(field.signer_id);
  }
  return ids;
}

export const SIGNATURE_MODES = ['type', 'draw', 'upload'] as const;
export type SignatureMode = (typeof SIGNATURE_MODES)[number];

export interface Signer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: SignerStatus;
  readonly avatarUrl?: string;
}

export type SignatureValue =
  | { readonly kind: 'typed'; readonly text: string; readonly font: 'caveat' }
  | { readonly kind: 'drawn'; readonly pngDataUrl: string; readonly strokes: number }
  | { readonly kind: 'upload'; readonly pngDataUrl: string; readonly fileName: string };
