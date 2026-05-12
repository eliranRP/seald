import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import { sql } from 'kysely';
import type { Database, GDriveEnvelopeExportsTable } from '../../../db/schema';
import { DB_TOKEN } from '../../db/db.provider';
import type {
  GdriveEnvelopeExport,
  GdriveEnvelopeExportsRepository,
  UpsertGdriveEnvelopeExportArgs,
} from './gdrive-envelope-exports.repository';

type Row = Selectable<GDriveEnvelopeExportsTable>;

function toDomain(r: Row): GdriveEnvelopeExport {
  return {
    id: r.id,
    envelopeId: r.envelope_id,
    accountId: r.account_id,
    folderId: r.folder_id,
    folderName: r.folder_name,
    sealedFileId: r.sealed_file_id,
    auditFileId: r.audit_file_id,
    lastPushedAt: new Date(r.last_pushed_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

@Injectable()
export class GdriveEnvelopeExportsPgRepository implements GdriveEnvelopeExportsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {}

  async findByEnvelopeAndAccount(
    envelopeId: string,
    accountId: string,
  ): Promise<GdriveEnvelopeExport | null> {
    const r = await this.db
      .selectFrom('gdrive_envelope_exports')
      .selectAll()
      .where('envelope_id', '=', envelopeId)
      .where('account_id', '=', accountId)
      .executeTakeFirst();
    return r ? toDomain(r) : null;
  }

  async findLatestByEnvelope(envelopeId: string): Promise<GdriveEnvelopeExport | null> {
    const r = await this.db
      .selectFrom('gdrive_envelope_exports')
      .selectAll()
      .where('envelope_id', '=', envelopeId)
      .orderBy('last_pushed_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    return r ? toDomain(r) : null;
  }

  async upsert(args: UpsertGdriveEnvelopeExportArgs): Promise<GdriveEnvelopeExport> {
    const now = sql<string>`now()`;
    const inserted = await this.db
      .insertInto('gdrive_envelope_exports')
      .values({
        envelope_id: args.envelopeId,
        account_id: args.accountId,
        folder_id: args.folderId,
        folder_name: args.folderName,
        sealed_file_id: args.sealedFileId,
        audit_file_id: args.auditFileId,
        last_pushed_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(['envelope_id', 'account_id']).doUpdateSet({
          folder_id: args.folderId,
          folder_name: args.folderName,
          sealed_file_id: args.sealedFileId,
          audit_file_id: args.auditFileId,
          last_pushed_at: now,
          updated_at: now,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(inserted);
  }
}
