import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { createJwksProvider } from './jwks.provider';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';

/**
 * `AuthGuard` is registered both as a regular provider (so existing
 * `@UseGuards(AuthGuard)` decorators that pre-date the global wiring keep
 * resolving the same instance via DI) AND as the global APP_GUARD
 * default-deny gate. The redundant per-route `@UseGuards(AuthGuard)` are
 * being removed in this PR; what remains are routes that compose
 * AuthGuard with another guard.
 */
@Module({
  providers: [
    createJwksProvider(),
    SupabaseJwtStrategy,
    AuthGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthGuard, SupabaseJwtStrategy],
})
export class AuthModule {}
