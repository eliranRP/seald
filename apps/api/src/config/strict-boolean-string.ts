import { z } from 'zod';

/**
 * Shown when an env boolean is not one of the accepted strings.
 * Stable so operators and tests can match it.
 */
export const STRICT_BOOLEAN_STRING_MESSAGE =
  'must be a boolean string: "true", "false", "1", or "0"';

/**
 * Env-var boolean. `z.coerce.boolean()` calls `Boolean()`, and
 * `Boolean("false")` is `true`, so a flag set to the string `"false"`
 * would enable the thing it names.
 *
 * `"true"` and `"1"` become true. `"false"` and `"0"` become false.
 * Comparison is case-sensitive. `undefined` (the variable is unset)
 * uses `defaultValue`. Any other value fails validation.
 */
export function strictBooleanString(defaultValue: boolean) {
  return z
    .stringbool({
      truthy: ['true', '1'],
      falsy: ['false', '0'],
      case: 'sensitive',
      error: STRICT_BOOLEAN_STRING_MESSAGE,
    })
    .default(defaultValue);
}
