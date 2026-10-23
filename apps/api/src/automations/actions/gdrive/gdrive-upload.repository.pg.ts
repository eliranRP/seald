import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../../../db/schema';
import { DB_TOKEN } from '../../../db/db.provider';
import { withAutomationTables, type AutomationsDatabase } from '../../automations.schema';
import { GdriveUploadRepository, type GdriveUploadContext } from './gdrive-upload.repository';

@Injectable()
export class GdriveUploadPgRepository extends GdriveUploadRepository {
  private readonly db: Kysely<AutomationsDatabase>;

  constructor(@Inject(DB_TOKEN) db: Kysely<Database>) {
    super();
    this.db = withAutomationTables(db);
  }

  async loadContext(input: {
    readonly ownerId: string;
    readonly envelopeId: string;
  }): Promise<GdriveUploadContext | null> {
    const envelope = await this.db
      .selectFrom('envelopes')
      .select(['id', 'title', 'status', 'sealed_file_path', 'audit_file_path'])
      .where('id', '=', input.envelopeId)
      .where('owner_id', '=', input.ownerId)
      .executeTakeFirst();
    if (!envelope) return null;
    const docs = await this.db
      .selectFrom('envelope_documents')
      .select(['ord', 'title', 'sealed_file_path'])
      .where('envelope_id', '=', input.envelopeId)
      .orderBy('ord', 'asc')
      .execute();
    return {
      envelope: {
        id: envelope.id,
        title: envelope.title,
        status: envelope.status,
        auditPath: envelope.audit_file_path,
        sealedPath: envelope.sealed_file_path,
      },
      documents: docs.map((d) => ({ ord: d.ord, title: d.title, sealedPath: d.sealed_file_path })),
    };
  }

  async rememberFolder(input: {
    readonly ownerId: string;
    readonly automationId: string;
    readonly folderId: string;
    readonly folderName: string;
  }): Promise<string> {
    const patch = JSON.stringify({ folder_id: input.folderId, folder_name: input.folderName });
    await this.db
      .updateTable('automations')
      .set({ config: sql`config || ${patch}::jsonb` as never })
      .where('id', '=', input.automationId)
      .where('owner_id', '=', input.ownerId)
      .where(sql<boolean>`coalesce(config->>'folder_id', '') = ''`)
      .execute();
    const row = await this.db
      .selectFrom('automations')
      .select(sql<string | null>`config->>'folder_id'`.as('folder_id'))
      .where('id', '=', input.automationId)
      .where('owner_id', '=', input.ownerId)
      .executeTakeFirst();
    return row?.folder_id ?? input.folderId;
  }
}
