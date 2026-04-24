import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { ContactsModule } from './contacts/contacts.module';
import { DbModule } from './db/db.module';
import { EmailModule } from './email/email.module';
import { CronModule } from './cron/cron.module';
import { EnvelopesModule } from './envelopes/envelopes.module';
import { HealthModule } from './health/health.module';
import { SealingModule } from './sealing/sealing.module';
import { VerifyModule } from './verify/verify.module';
import { SigningModule } from './signing/signing.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    StorageModule,
    SigningModule,
    EmailModule,
    AuthModule,
    HealthModule,
    ContactsModule,
    EnvelopesModule,
    SealingModule,
    VerifyModule,
    CronModule,
  ],
})
export class AppModule {}
