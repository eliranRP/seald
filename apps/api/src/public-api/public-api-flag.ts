import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { isFeatureEnabled } from 'shared';

/**
 * `/api/v1` serves only while the `publicApi` flag is on (parity plan D1).
 * Read per request. The `MCP_DISABLED` incident switch is for the MCP
 * surface only and does not touch this one.
 */
export function publicApiEnabled(): boolean {
  return isFeatureEnabled('publicApi');
}

/** First guard on every `/api/v1` route: a dark surface is a 404 before auth. */
@Injectable()
export class PublicApiFlagGuard implements CanActivate {
  canActivate(): boolean {
    if (!publicApiEnabled()) throw new NotFoundException('not_found');
    return true;
  }
}
