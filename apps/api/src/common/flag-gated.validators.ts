import { ValidateIf, registerDecorator, type ValidationArguments } from 'class-validator';
import { isFeatureEnabled, type FeatureFlag } from 'shared';

/**
 * Validators whose answer depends on a feature flag at request time.
 *
 * With the flag off they reproduce what the DTO said before the property
 * (or enum value) existed, so a dark request fails with the same 400 body:
 *
 *   - {@link FlagGatedProperty}: `property <name> should not exist`, the
 *     text `forbidNonWhitelisted` gives an undeclared property.
 *   - {@link IsInWhenEnabled}: the `isIn` message over the legacy list.
 */

/**
 * The property may only be sent while `flag` is on, and then `check` must
 * accept it. `undefined` is always fine (the property is optional);
 * `null` and everything else is checked.
 */
export function FlagGatedProperty(
  flag: FeatureFlag,
  check: (value: unknown) => boolean,
  messageWhenOn: (property: string) => string,
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    const property = String(propertyKey);
    ValidateIf((o: Record<string, unknown>) => o[property] !== undefined)(target, propertyKey);
    registerDecorator({
      name: 'flagGatedProperty',
      target: target.constructor,
      propertyName: property,
      validator: {
        validate: (value: unknown): boolean => isFeatureEnabled(flag) && check(value),
        defaultMessage: (args: ValidationArguments): string =>
          isFeatureEnabled(flag)
            ? messageWhenOn(args.property)
            : `property ${args.property} should not exist`,
      },
    });
  };
}

/**
 * `@IsIn(...)` whose allowed list grows when `flag` is on. The message
 * matches class-validator's `isIn` text for whichever list applies.
 */
export function IsInWhenEnabled(
  flag: FeatureFlag,
  legacy: readonly string[],
  whenOn: readonly string[],
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    const allowed = (): readonly string[] => (isFeatureEnabled(flag) ? whenOn : legacy);
    registerDecorator({
      name: 'isIn',
      target: target.constructor,
      propertyName: String(propertyKey),
      validator: {
        validate: (value: unknown): boolean => allowed().includes(value as string),
        defaultMessage: (args: ValidationArguments): string =>
          `${args.property} must be one of the following values: ${allowed().join(', ')}`,
      },
    });
  };
}

/** A non-null, non-array object (field meta; the deep check is Zod). */
export function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
