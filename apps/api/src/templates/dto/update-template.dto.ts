import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TemplateFieldDto } from './create-template.dto';

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  readonly field_layout?: ReadonlyArray<TemplateFieldDto>;
}
