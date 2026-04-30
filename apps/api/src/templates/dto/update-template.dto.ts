import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TemplateFieldDto, TemplateLastSignerDto } from './create-template.dto';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly description?: string | null;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'cover_color must be a 6-digit hex like #RRGGBB',
  })
  readonly cover_color?: string | null;

  // Same 200-entry cap as `CreateTemplateDto.field_layout` — keeps
  // memory + JSON-encode bounded on update too. Server review SHOULD-FIX
  // #1 (defence against unbounded array submission).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200, { message: 'field_layout cannot have more than 200 entries' })
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  readonly field_layout?: ReadonlyArray<TemplateFieldDto>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32, { message: 'tags cannot have more than 32 entries' })
  @IsString({ each: true })
  @MaxLength(48, { each: true, message: 'tag entries cannot exceed 48 characters' })
  readonly tags?: ReadonlyArray<string>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'last_signers cannot have more than 50 entries' })
  @ValidateNested({ each: true })
  @Type(() => TemplateLastSignerDto)
  readonly last_signers?: ReadonlyArray<TemplateLastSignerDto>;
}
