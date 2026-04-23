import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { createJwksProvider } from './jwks.provider';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';

@Module({
  providers: [createJwksProvider(), SupabaseJwtStrategy, AuthGuard],
  exports: [AuthGuard, SupabaseJwtStrategy],
})
export class AuthModule {}
