import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContactsModule } from '../contacts/contacts.module';
import { GDriveModule } from '../integrations/gdrive/gdrive.module';
import { EnvelopeDocumentsController } from './documents/envelope-documents.controller';
import { EnvelopeDocumentsRepository } from './documents/envelope-documents.repository';
import { EnvelopeDocumentsPgRepository } from './documents/envelope-documents.repository.pg';
import { EnvelopeDocumentsService } from './documents/envelope-documents.service';
import { EnvelopesController } from './envelopes.controller';
import { EnvelopesRepository } from './envelopes.repository';
import { EnvelopesPgRepository } from './envelopes.repository.pg';
import { EnvelopesService } from './envelopes.service';

@Module({
  // GDriveModule exports GDriveService + GdriveExportService +
  // GDRIVE_ENVELOPE_EXPORTS_REPOSITORY — all injected by EnvelopesService
  // for the "Save to Google Drive" feature + the `gdriveExport` block on
  // the envelope-detail payload.
  imports: [AuthModule, ContactsModule, GDriveModule],
  controllers: [EnvelopesController, EnvelopeDocumentsController],
  providers: [
    EnvelopesService,
    { provide: EnvelopesRepository, useClass: EnvelopesPgRepository },
    // WP-03 multi-file envelopes (migration 0022).
    EnvelopeDocumentsService,
    { provide: EnvelopeDocumentsRepository, useClass: EnvelopeDocumentsPgRepository },
  ],
  exports: [
    EnvelopesRepository,
    EnvelopesService,
    EnvelopeDocumentsRepository,
    EnvelopeDocumentsService,
  ],
})
export class EnvelopesModule {}
