import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [ConfigModule, DbModule, AuthModule, HealthModule] })
export class AppModule {}
