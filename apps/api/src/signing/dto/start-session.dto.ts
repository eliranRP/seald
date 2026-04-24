import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class StartSessionDto {
  @IsUUID()
  readonly envelope_id!: string;

  // Opaque URL-safe base64 token — 43 chars (256-bit payload).
  // See SigningTokenService.generate.
  @IsString()
  @Length(43, 43)
  @Matches(/^[A-Za-z0-9_-]+$/)
  readonly token!: string;
}
