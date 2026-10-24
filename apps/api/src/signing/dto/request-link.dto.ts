import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

/**
 * Body of `POST /sign/request-link`. The signer is named by the expired
 * token, or by the envelope id plus the address the invite went to.
 */
export class RequestLinkDto {
  @IsUUID()
  readonly envelope_id!: string;

  @IsOptional()
  @IsString()
  @Length(43, 43)
  @Matches(/^[A-Za-z0-9_-]+$/)
  readonly token?: string;

  @ValidateIf((o: RequestLinkDto) => o.token === undefined)
  @IsEmail()
  readonly email?: string;
}
