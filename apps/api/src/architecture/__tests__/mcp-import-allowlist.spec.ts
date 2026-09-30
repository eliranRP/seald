import path from 'node:path';

interface LintMessage {
  readonly ruleId: string | null;
  readonly message: string;
  readonly fatal?: boolean | undefined;
}

interface LintResult {
  readonly messages: readonly LintMessage[];
  readonly fatalErrorCount: number;
}

interface ESLintLike {
  lintText(code: string, options: { filePath: string }): Promise<LintResult[]>;
}

interface ESLintModule {
  ESLint: new (options: {
    cwd: string;
    cache: boolean;
    overrideConfig: {
      parserOptions: { project: null };
      rules: Record<string, 'off'>;
    };
  }) => ESLintLike;
}

/**
 * ESLint 8 has no bundled types here. Load it through an untyped require
 * so this spec does not add `@types/eslint`.
 */
function loadEslint(): ESLintModule {
  return (require as unknown as (id: string) => ESLintModule)('eslint');
}

/**
 * Step 0d allowlist. `lintText` applies the config for `filePath`
 * without writing a probe. `parserOptions.project` is cleared because
 * the virtual `src/mcp` path is not in the TypeScript program; a
 * type-aware parse would fail before `no-restricted-imports` runs.
 * The two type-aware rules are off on this instance for the same
 * reason. On CI, typescript-eslint also snapshots that program once,
 * so a rewritten file on disk would lint as empty.
 */
const apiRoot = path.resolve(__dirname, '../../..');
const mcpFile = path.join(apiRoot, 'src/mcp/server.ts');
const serviceFile = path.join(apiRoot, 'src/envelopes/envelopes.service.ts');

describe('MCP import allowlist', () => {
  const eslintModule = loadEslint();
  const eslint = new eslintModule.ESLint({
    cwd: apiRoot,
    cache: false,
    overrideConfig: {
      parserOptions: { project: null },
      rules: {
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/only-throw-error': 'off',
      },
    },
  });

  async function restricted(filePath: string, source: string): Promise<readonly string[]> {
    const results = await eslint.lintText(source, { filePath });
    const result = results[0];
    expect(result).toBeDefined();
    expect(result?.fatalErrorCount ?? 0).toBe(0);
    return (result?.messages ?? [])
      .filter((message) => message.ruleId === 'no-restricted-imports')
      .map((message) => message.message);
  }

  it('rejects a repository import', async () => {
    const messages = await restricted(
      mcpFile,
      "import { EnvelopesRepository } from '../envelopes/envelopes.repository';\nexport const boundary = EnvelopesRepository;\n",
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects a controller import', async () => {
    const messages = await restricted(
      mcpFile,
      "import { EnvelopesController } from '../envelopes/envelopes.controller';\nexport const boundary = EnvelopesController;\n",
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects pdf inspection and a Drive HTTP mapper', async () => {
    const inspection = await restricted(
      mcpFile,
      "import { inspectPdfBytes } from '../envelopes/pdf-inspection';\nexport const boundary = inspectPdfBytes;\n",
    );
    const mapper = await restricted(
      mcpFile,
      "import { mapDriveFilesHttpError } from '../integrations/gdrive/drive-files.http-errors';\nexport const boundary = mapDriveFilesHttpError;\n",
    );
    expect(inspection.length).toBeGreaterThan(0);
    expect(mapper.length).toBeGreaterThan(0);
  });

  it('rejects the database clients', async () => {
    const kysely = await restricted(
      mcpFile,
      "import { Kysely } from 'kysely';\nexport const boundary = Kysely;\n",
    );
    const pg = await restricted(
      mcpFile,
      "import { Pool } from 'pg';\nexport const boundary = Pool;\n",
    );
    expect(kysely.length).toBeGreaterThan(0);
    expect(pg.length).toBeGreaterThan(0);
  });

  it('rejects signing and sealing services', async () => {
    const signing = await restricted(
      mcpFile,
      "import { SigningService } from '../signing/signing.service';\nexport const boundary = SigningService;\n",
    );
    const sealing = await restricted(
      mcpFile,
      "import { SealingService } from '../sealing/sealing.service';\nexport const boundary = SealingService;\n",
    );
    expect(signing.join('\n')).toContain('signing or sealing');
    expect(sealing.join('\n')).toContain('signing or sealing');
  });

  it('allows an application service, including a nested Drive service', async () => {
    const envelopes = await restricted(
      mcpFile,
      "import { EnvelopesService } from '../envelopes/envelopes.service';\nexport const boundary = EnvelopesService;\n",
    );
    const drive = await restricted(
      mcpFile,
      "import { DriveFilesService } from '../../integrations/gdrive/drive-files.service';\nexport const boundary = DriveFilesService;\n",
    );
    expect(envelopes).toEqual([]);
    expect(drive).toEqual([]);
  });

  it('allows the shared package, Nest, and another file in src/mcp', async () => {
    const shared = await restricted(
      mcpFile,
      "import { FIELD_KINDS } from 'shared';\nexport const boundary = FIELD_KINDS;\n",
    );
    const nest = await restricted(
      mcpFile,
      "import { Injectable } from '@nestjs/common';\nexport const boundary = Injectable;\n",
    );
    const local = await restricted(
      mcpFile,
      "import { localTool } from './tools/envelopes.tool';\nexport const boundary = localTool;\n",
    );
    expect(shared).toEqual([]);
    expect(nest).toEqual([]);
    expect(local).toEqual([]);
  });

  it('does not apply the allowlist to an application service', async () => {
    const messages = await restricted(
      serviceFile,
      "import { EnvelopesRepository } from './envelopes.repository';\nexport const boundary = EnvelopesRepository;\n",
    );
    expect(messages).toEqual([]);
  });
});
