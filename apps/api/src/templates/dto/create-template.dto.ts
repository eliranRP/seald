import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
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

/**
 * Last-used signer entry persisted on Send-and-update so the next
 * sender starts with the same roster pre-filled. Stored verbatim;
 * `id` is the contact id (UUID) for known contacts or a synthesized
 * `s-…` token for ad-hoc guest signers.
 */
export class TemplateLastSignerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  readonly id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  readonly name!: string;

  @IsEmail()
  @MaxLength(254)
  readonly email!: string;

  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a 6-digit hex like #RRGGBB',
  })
  readonly color!: string;
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

  /**
   * Capped at 200 entries to keep memory + JSON-encode work bounded.
   * Real templates ship with 5-20 entries (NDA: 5, ICA: 11). 200 is
   * 10x our worst-case observed; if a future product change needs more,
   * raise this AND add a matching `CHECK (jsonb_array_length(...) <= N)`
   * in the DB so the limit lives in two places (defence-in-depth).
   * (Server review SHOULD-FIX #1.)
   */
  @IsArray()
  @ArrayMaxSize(200, { message: 'field_layout cannot have more than 200 entries' })
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  readonly field_layout!: ReadonlyArray<TemplateFieldDto>;

  /**
   * Optional client-side tags for filter / group-by-tag in the
   * templates list. Cap of 32 keeps the list compact and prevents
   * abuse via the public API. Each tag is bounded length-wise.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32, { message: 'tags cannot have more than 32 entries' })
  @IsString({ each: true })
  @MaxLength(48, { each: true, message: 'tag entries cannot exceed 48 characters' })
  readonly tags?: ReadonlyArray<string>;

  /**
   * Optional last-signers roster. Caller sends this on the very first
   * Save-as-template that follows a real send so the next user gets a
   * pre-filled list.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'last_signers cannot have more than 50 entries' })
  @ValidateNested({ each: true })
  @Type(() => TemplateLastSignerDto)
  readonly last_signers?: ReadonlyArray<TemplateLastSignerDto>;
}
