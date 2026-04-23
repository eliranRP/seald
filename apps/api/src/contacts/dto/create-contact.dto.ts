import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const lowercaseTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly name!: string;

  @Transform(lowercaseTrim)
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;

  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a 6-digit hex like #RRGGBB',
  })
  readonly color!: string;
}
