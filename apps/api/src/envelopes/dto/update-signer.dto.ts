import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const lowerTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** PATCH /envelopes/:id/signers/:signer_id — fix an email (and optionally a name). */
export class UpdateSignerDto {
  @IsEmail()
  @Transform(lowerTrim)
  readonly email!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Transform(trim)
  readonly name?: string;
}

/** POST /envelopes/:id/signers/:signer_id/replace — the person who signs instead. */
export class ReplaceSignerDto {
  @IsEmail()
  @Transform(lowerTrim)
  readonly email!: string;

  @IsString()
  @Length(1, 200)
  @Transform(trim)
  readonly name!: string;
}
