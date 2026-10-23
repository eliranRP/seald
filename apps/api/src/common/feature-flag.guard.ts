import { NotFoundException } from '@nestjs/common';
import { isFeatureEnabled, type FeatureFlag } from 'shared';

/**
 * Throws a 404 (`{ error: 'not_found' }`-shaped Nest NotFoundException) when
 * the given feature flag is off. Controllers call this at the top of each
 * handler so a dark feature is indistinguishable from a route that does not
 * exist. Mirrors `GDriveController.requireFlag()`.
 */
export function requireFlag(flag: FeatureFlag): void {
  if (!isFeatureEnabled(flag)) {
    throw new NotFoundException('not_found');
  }
}
