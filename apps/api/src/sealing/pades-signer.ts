import { Injectable } from '@nestjs/common';

/**
 * Port for applying a PAdES (PDF Advanced Electronic Signatures) signature
 * to a burned-in PDF. In the production deploy this will be implemented by
 * a `@signpdf/signpdf`-backed adapter loading a P12 keypair from an env var,
 * optionally with a TSA (RFC 3161) timestamp round-trip.
 *
 * For the MVP the default implementation is a passthrough — the sealed
 * PDF has the signature burn-in and a computable sha256, but no embedded
 * CMS signature dictionary. This is enough for the verify endpoint to
 * compare artifact hashes; proper cryptographic chain-of-custody is a
 * tracked follow-up.
 */
@Injectable()
export abstract class PadesSigner {
  abstract sign(pdf: Buffer): Promise<Buffer>;
}

@Injectable()
export class NoopPadesSigner extends PadesSigner {
  async sign(pdf: Buffer): Promise<Buffer> {
    // Intentional passthrough. See class comment on PadesSigner for why.
    return pdf;
  }
}
