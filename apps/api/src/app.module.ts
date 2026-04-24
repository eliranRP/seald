import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { ContactsModule } from './contacts/contacts.module';
import { DbModule } from './db/db.module';
import { EnvelopesModule } from './envelopes/envelopes.module';
import { HealthModule } from './health/health.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    StorageModule,
    AuthModule,
    HealthModule,
    ContactsModule,
    EnvelopesModule,
  ],
})
export class AppModule {}
