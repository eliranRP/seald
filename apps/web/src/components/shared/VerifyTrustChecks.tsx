import { Check } from 'lucide-react';

interface VerifyTrustChecksProps {
  /**
   * The public verify payload does not currently report a CMS profile or
   * an embedded timestamp. Pass these only when a future payload says the
   * seal and the RFC 3161 token are present. A sealed SHA-256 alone is
   * not enough: the noop signer hashes the file without a CMS seal.
   */
  readonly hasPadesSeal?: boolean;
  readonly hasRfc3161Timestamp?: boolean;
}

/**
 * Footer checks on the public verify page. The SHA-256 audit chain is
 * the check the payload always carries (`chain_intact`). PAdES and the
 * timestamp render only when the caller knows they are present.
 */
export function VerifyTrustChecks({
  hasPadesSeal = false,
  hasRfc3161Timestamp = false,
}: VerifyTrustChecksProps) {
  return (
    <>
      <span>
        <Check aria-hidden /> SHA-256 audit chain
      </span>
      {hasPadesSeal ? (
        <span>
          <Check aria-hidden /> PAdES seal
        </span>
      ) : null}
      {hasRfc3161Timestamp ? (
        <span>
          <Check aria-hidden /> RFC 3161 timestamp
        </span>
      ) : null}
    </>
  );
}
