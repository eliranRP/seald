import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { TEMPLATE_FIELD_TYPES, type TemplatePageRule } from 'shared';

const PAGE_RULE_LITERALS = ['all', 'allButLast', 'first', 'last'] as const;

/**
 * Accept either a pageRule literal OR a positive integer (1-indexed page
 * number). class-validator can't natively express that union; we register
 * a one-off decorator instead of stacking two with conflicting semantics.
 */
function IsPageRule(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    registerDecorator({
      name: 'isPageRule',
      target: target.constructor,
      propertyName: String(propertyKey),
      ...(options ? { options } : {}),
      validator: {
        validate(value: unknown): boolean {
          if (
            typeof value === 'string' &&
            (PAGE_RULE_LITERALS as ReadonlyArray<string>).includes(value)
          ) {
            return true;
          }
          return typeof value === 'number' && Number.isInteger(value) && value >= 1;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be one of [${PAGE_RULE_LITERALS.join(', ')}] or a positive integer (1-indexed page number)`;
        },
      },
    });
  };
}

/**
 * One field layout entry inside `field_layout`. The `pageRule` union is
 * validated by the custom decorator above; `type` against the shared
 * enum so the seald API and SPA share the same allowed values.
 */
export class TemplateFieldDto {
  @IsString()
  @IsIn([...TEMPLATE_FIELD_TYPES])
  readonly type!: (typeof TEMPLATE_FIELD_TYPES)[number];

  @IsPageRule()
  readonly pageRule!: TemplatePageRule;

  @IsNumber()
  readonly x!: number;

  @IsNumber()
  readonly y!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly label?: string;
}

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly description?: string | null;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'cover_color must be a 6-digit hex like #RRGGBB',
  })
  readonly cover_color?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  readonly field_layout!: ReadonlyArray<TemplateFieldDto>;
}
