import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FIELD_KINDS, type FieldKind } from 'shared';

export class FieldPlacementDto {
  @IsUUID()
  readonly signer_id!: string;

  @IsIn(FIELD_KINDS as unknown as string[])
  readonly kind!: FieldKind;

  @IsInt()
  @Min(1)
  readonly page!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  readonly x!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  readonly y!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  readonly width?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  readonly height?: number | null;

  @IsOptional()
  @IsBoolean()
  readonly required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly link_id?: string | null;
}

export class PlaceFieldsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FieldPlacementDto)
  readonly fields!: FieldPlacementDto[];
}
