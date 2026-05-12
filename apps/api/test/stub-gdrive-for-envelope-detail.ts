import type { TestingModuleBuilder } from '@nestjs/testing';
import { GDriveService } from '../src/integrations/gdrive/gdrive.service';
import { GDRIVE_ENVELOPE_EXPORTS_REPOSITORY } from '../src/integrations/gdrive/gdrive-envelope-exports.repository';

/**
 * `GET /envelopes/:id` enriches the response with a `gdriveExport` block,
 * which queries `gdrive_accounts` + `gdrive_envelope_exports`. e2e specs
 * that boot the full `AppModule` against a non-existent Postgres (the
 * EnvelopesRepository / ContactsRepository are overridden with in-memory
 * fakes precisely to avoid the DB) would otherwise try to open a real
 * connection on the first detail read. Override the two collaborators
 * with no-op stubs so those reads stay DB-free.
 *
 * Tests that DO want to assert the gdrive bits should override these
 * with richer fakes instead of calling this helper.
 */
export function stubGdriveForEnvelopeDetail(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder
    .overrideProvider(GDriveService)
    .useValue({
      listAccounts: async () => [],
    })
    .overrideProvider(GDRIVE_ENVELOPE_EXPORTS_REPOSITORY)
    .useValue({
      findByEnvelopeAndAccount: async () => null,
      findLatestByEnvelope: async () => null,
      upsert: async () => {
        throw new Error('gdrive_export_upsert_not_stubbed');
      },
    });
}
