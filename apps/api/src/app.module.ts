import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [ConfigModule, AuthModule, HealthModule] })
export class AppModule {}
