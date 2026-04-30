import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * T-14 — body for `POST /sign/esign-disclosure`. The `disclosure_version`
 * is a short human-readable tag (e.g. `"esign_v0.1"`) that maps 1:1 to
 * the disclosure copy the signer saw. We persist the version into the
 * audit-event metadata so we can later prove which disclosure applied.
 */
export class EsignDisclosureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  // Permissive char set: lowercase, digits, dot, underscore, hyphen.
  // Tight enough to reject smuggling attempts in event metadata; loose
  // enough to fit any reasonable version label.
  @Matches(/^[a-z0-9._-]+$/)
  readonly disclosure_version!: string;
}
