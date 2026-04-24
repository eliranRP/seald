import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContactsModule } from '../contacts/contacts.module';
import { EnvelopesController } from './envelopes.controller';
import { EnvelopesRepository } from './envelopes.repository';
import { EnvelopesPgRepository } from './envelopes.repository.pg';
import { EnvelopesService } from './envelopes.service';

@Module({
  imports: [AuthModule, ContactsModule],
  controllers: [EnvelopesController],
  providers: [EnvelopesService, { provide: EnvelopesRepository, useClass: EnvelopesPgRepository }],
  exports: [EnvelopesRepository],
})
export class EnvelopesModule {}
