/* eslint-disable no-console */
import { parseEnv } from '../src/config/env.schema';
import { createDb } from '../src/db/db.provider';
import { GDriveKmsService } from '../src/integrations/gdrive/gdrive-kms.service';
import { LOCAL_WRAP_KEY_ID } from '../src/integrations/gdrive/local-wrap-kms-client';
import { rewrapGdriveTokens } from '../src/integrations/gdrive/rewrap-tokens';

/**
 * One-off: re-wrap stored Drive refresh tokens from AWS KMS to the local
 * wrap key (docs/aws-exit-plan.md WS-3), so nobody has to reconnect Drive
 * when the KMS key is retired. Run it while AWS credentials still work:
 *
 *   DATABASE_URL=... GDRIVE_TOKEN_WRAP_KEY=... \
 *   GDRIVE_TOKEN_KMS_KEY_ARN=... GDRIVE_TOKEN_KMS_REGION=... \
 *   pnpm --filter api exec ts-node scripts/rewrap-gdrive-tokens.ts [--apply]
 *
 * Without --apply it is a dry run: every row is decrypted, nothing is
 * written. Exits non-zero if any row could not be decrypted.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const env = parseEnv(process.env);
  if (!env.GDRIVE_TOKEN_WRAP_KEY || !env.GDRIVE_TOKEN_KMS_KEY_ARN || !env.GDRIVE_TOKEN_KMS_REGION) {
    throw new Error(
      'set GDRIVE_TOKEN_WRAP_KEY and both GDRIVE_TOKEN_KMS_* vars: old rows decrypt through KMS',
    );
  }
  const kms = GDriveKmsService.fromEnv(env);
  if (kms.currentKeyArn !== LOCAL_WRAP_KEY_ID) throw new Error('the wrap key was not picked up');
  const db = createDb(env, { maxConnections: 1 });
  try {
    const result = await rewrapGdriveTokens(db, kms, { dryRun: !apply });
    console.log(`${apply ? 'applied' : 'dry run'}: ${JSON.stringify(result)}`);
    if (result.failed.length > 0) process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
