import type { Kysely } from 'kysely';
import type { Database } from '../../../db/schema';
import type { GDriveKmsService } from './gdrive-kms.service';

export interface RewrapResult {
  readonly scanned: number;
  readonly rewrapped: number;
  /** Rows that could not be decrypted with the configured keys (left as they are). */
  readonly failed: ReadonlyArray<string>;
  /** Rows that changed while we worked on them (reconnected, disconnected); left alone. */
  readonly raced: number;
}

/**
 * One-off move of stored Drive refresh tokens from AWS KMS wrapping to the
 * local wrap key (docs/aws-exit-plan.md WS-3), so users keep their Drive
 * connection when the KMS key is retired.
 *
 * `kms` must be built with GDRIVE_TOKEN_WRAP_KEY *and* the KMS key set:
 * old rows decrypt through KMS, new ciphertext is wrapped locally and
 * stamped with `kms.currentKeyArn`. Each row is updated only if it still
 * holds the ciphertext we read, so a reconnect or disconnect running at
 * the same time wins. Re-running is safe: rows already on the current key
 * are skipped. With `dryRun` nothing is written; every row is still
 * decrypted, which proves the keys work before the real run.
 */
export async function rewrapGdriveTokens(
  db: Kysely<Database>,
  kms: GDriveKmsService,
  opts: { readonly dryRun?: boolean } = {},
): Promise<RewrapResult> {
  const target = kms.currentKeyArn;
  const rows = await db
    .selectFrom('gdrive_accounts')
    .select(['id', 'refresh_token_ciphertext', 'refresh_token_kms_key_arn'])
    .where('refresh_token_ciphertext', 'is not', null)
    .where('refresh_token_kms_key_arn', 'is not', null)
    .where('refresh_token_kms_key_arn', '!=', target)
    .execute();

  let rewrapped = 0;
  let raced = 0;
  const failed: string[] = [];
  for (const row of rows) {
    // A copy for the optimistic check below: decrypt() zeroes the data key
    // it gets back, and a KMS client may hand back a view into this buffer.
    const ciphertext = Buffer.from(row.refresh_token_ciphertext as Buffer);
    const keyArn = row.refresh_token_kms_key_arn as string;
    let plaintext: string;
    try {
      plaintext = await kms.decrypt(Buffer.from(ciphertext), keyArn);
    } catch {
      failed.push(row.id);
      continue;
    }
    if (opts.dryRun) continue;
    const next = await kms.encrypt(plaintext);
    const updated = await db
      .updateTable('gdrive_accounts')
      .set({ refresh_token_ciphertext: next.ciphertext, refresh_token_kms_key_arn: next.kmsKeyArn })
      .where('id', '=', row.id)
      .where('refresh_token_kms_key_arn', '=', keyArn)
      .where('refresh_token_ciphertext', '=', ciphertext)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) === 1) rewrapped += 1;
    else raced += 1;
  }
  return { scanned: rows.length, rewrapped, failed, raced };
}
