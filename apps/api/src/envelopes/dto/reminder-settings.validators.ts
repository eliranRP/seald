import { ValidateBy, type ValidationOptions } from 'class-validator';
import { isExpiryWithinBounds, isFeatureEnabled } from 'shared';

/**
 * Expiry must sit between one day from now and the end of the UTC day 90
 * days from today (WP-09). Only enforced while `customReminders` is on, so
 * the existing `expires_at` contract is unchanged for dark flags.
 */
export function IsExpiryInBounds(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isExpiryInBounds',
      validator: {
        validate(value: unknown): boolean {
          if (!isFeatureEnabled('customReminders')) return true;
          if (typeof value !== 'string') return false;
          return isExpiryWithinBounds(Date.parse(value), Date.now());
        },
        defaultMessage(): string {
          return 'expires_at must be between 1 day and 90 days from now';
        },
      },
    },
    options,
  );
}
