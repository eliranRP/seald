import path from 'node:path';
import { ESLint, Linter } from 'eslint';

/**
 * Step 0d: `src/mcp` reaches the application through `*.service.ts` and
 * `shared` only. The rule is read from the real `.eslintrc.cjs` with
 * `calculateConfigForFile` (so the override globs are under test) and
 * applied to probe source with `Linter`. Linting probe files on disk would
 * hit typescript-eslint's program snapshot (CI=true), so the source is
 * checked as plain module syntax instead.
 */

const API_ROOT = path.resolve(__dirname, '..', '..');
const eslint = new ESLint({ cwd: API_ROOT });
const linter = new Linter();

async function restrictedMessages(file: string, source: string): Promise<string[]> {
  const config = (await eslint.calculateConfigForFile(path.join(API_ROOT, file))) as {
    rules?: Linter.RulesRecord;
  };
  const rule = config.rules?.['no-restricted-imports'];
  const messages = linter.verify(
    source,
    {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: rule ? { 'no-restricted-imports': rule } : {},
    },
    { filename: file },
  );
  return messages.map((m) => m.message);
}

const TOOL = 'src/mcp/tools/probe.tool.ts';

describe('src/mcp import boundary (step 0d)', () => {
  it.each([
    ['a service', "import { EnvelopesService } from '../../envelopes/envelopes.service';"],
    ['the shared package', "import { isFeatureEnabled } from 'shared';"],
    ['a file inside src/mcp', "import { registry } from '../registry';"],
    ['a third-party package', "import { z } from 'zod';"],
    [
      'the sender-side signing-order service',
      "import { SigningOrderService } from '../../signing/signing-order.service';",
    ],
  ])('allows importing %s', async (_name, source) => {
    expect(await restrictedMessages(TOOL, source)).toEqual([]);
  });

  it.each([
    ['a repository', "import { EnvelopesRepository } from '../../envelopes/envelopes.repository';"],
    ['a pg repository', "import { Pg } from '../../envelopes/envelopes.repository.pg';"],
    ['the db folder', "import { db } from '../../db/db.provider';"],
    ['the pg driver', "import { Pool } from 'pg';"],
    ['a controller', "import { EnvelopesController } from '../../envelopes/envelopes.controller';"],
    ['a guard', "import { AuthGuard } from '../../auth/auth.guard';"],
    [
      'HTTP error mapping',
      "import { mapGdriveSaveError } from '../../envelopes/gdrive-save-error.http-errors';",
    ],
    ['a Nest module', "import { EnvelopesModule } from '../../envelopes/envelopes.module';"],
    ['the signing service', "import { SigningService } from '../../signing/signing.service';"],
    ['the signer session service', "import { S } from '../../signing/signer-session.service';"],
    ['anything under signing', "import { x } from '../../signing/signing.helpers';"],
  ])('rejects importing %s', async (_name, source) => {
    expect(await restrictedMessages(TOOL, source)).toHaveLength(1);
  });

  it('keeps the existing extractSignature ban inside src/mcp', async () => {
    const out = await restrictedMessages(
      TOOL,
      "import { extractSignature } from '@signpdf/utils';",
    );
    expect(out).toHaveLength(1);
  });

  it('lets src/mcp/mcp.module.ts wire Nest modules but not repositories', async () => {
    const file = 'src/mcp/mcp.module.ts';
    expect(
      await restrictedMessages(
        file,
        "import { EnvelopesModule } from '../envelopes/envelopes.module';",
      ),
    ).toEqual([]);
    expect(
      await restrictedMessages(file, "import { R } from '../envelopes/envelopes.repository';"),
    ).toHaveLength(1);
  });

  it('does not restrict specs under src/mcp', async () => {
    expect(
      await restrictedMessages(
        'src/mcp/tools/__tests__/probe.tool.spec.ts',
        "import { R } from '../../../envelopes/envelopes.repository';",
      ),
    ).toEqual([]);
  });

  it('leaves the rest of the app unrestricted', async () => {
    expect(
      await restrictedMessages(
        'src/envelopes/envelopes.service.ts',
        "import { R } from './envelopes.repository';",
      ),
    ).toEqual([]);
  });
});
