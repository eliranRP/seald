import type { SignatureKind } from '../envelopes/envelopes.repository';

/**
 * Single source of truth for where each signature kind lives in object
 * storage. The signing service writes here on upload; the sealing
 * worker reads from the same helper at burn-in time so the two cannot
 * drift on string templating. Keeping the helper free of Nest decorators
 * lets the sealing module pull it in without taking on a SigningModule
 * dependency.
 */
export function signatureStoragePath(
  envelope_id: string,
  signer_id: string,
  kind: SignatureKind,
): string {
  return kind === 'initials'
    ? `${envelope_id}/signatures/${signer_id}-initials.png`
    : `${envelope_id}/signatures/${signer_id}.png`;
}
