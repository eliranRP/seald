import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key inspected by `AuthGuard` (registered as APP_GUARD in
 * AuthModule). Routes/controllers tagged with `@Public()` bypass the
 * default-deny user-JWT check — the global guard is the security default,
 * `@Public()` is the explicit opt-out for unauthenticated surfaces (health,
 * verify, signer-session-protected /sign, cron-secret-protected /internal).
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
