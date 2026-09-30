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
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { FIELD_KINDS, FIELD_PLACEMENT_ERRORS, fieldPlacementError, type FieldKind } from 'shared';

@ValidatorConstraint({ name: 'fieldExceedsPage', async: false })
class FieldExceedsPageConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const field = args.object as FieldPlacementDto;
    if (typeof field.x !== 'number' || typeof field.y !== 'number') return true;
    const code = fieldPlacementError(
      {
        x: field.x,
        y: field.y,
        page: typeof field.page === 'number' ? field.page : 1,
        width: field.width ?? null,
        height: field.height ?? null,
      },
      null,
    );
    return code !== FIELD_PLACEMENT_ERRORS.exceedsPage;
  }

  defaultMessage(): string {
    return FIELD_PLACEMENT_ERRORS.exceedsPage;
  }
}

export class FieldPlacementDto {
  @IsUUID()
  readonly signer_id!: string;

  @IsIn([...FIELD_KINDS])
  readonly kind!: FieldKind;

  @IsInt()
  @Min(1)
  readonly page!: number;

  @IsNumber()
  @Min(0, { message: FIELD_PLACEMENT_ERRORS.xOutOfRange })
  @Max(1, { message: FIELD_PLACEMENT_ERRORS.xOutOfRange })
  @Validate(FieldExceedsPageConstraint)
  readonly x!: number;

  @IsNumber()
  @Min(0, { message: FIELD_PLACEMENT_ERRORS.yOutOfRange })
  @Max(1, { message: FIELD_PLACEMENT_ERRORS.yOutOfRange })
  readonly y!: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: FIELD_PLACEMENT_ERRORS.widthOutOfRange })
  @Max(1, { message: FIELD_PLACEMENT_ERRORS.widthOutOfRange })
  readonly width?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: FIELD_PLACEMENT_ERRORS.heightOutOfRange })
  @Max(1, { message: FIELD_PLACEMENT_ERRORS.heightOutOfRange })
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
