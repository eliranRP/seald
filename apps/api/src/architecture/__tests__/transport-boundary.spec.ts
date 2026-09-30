import path from 'node:path';

interface LintMessage {
  readonly ruleId: string | null;
  readonly message: string;
}

interface CalculatedConfig {
  readonly rules: Readonly<Record<string, unknown>>;
}

interface ESLintLike {
  lintFiles(patterns: string[]): Promise<Array<{ messages: LintMessage[] }>>;
  calculateConfigForFile(filePath: string): Promise<CalculatedConfig>;
}

interface LinterLike {
  verify(
    code: string,
    config: {
      parserOptions: { ecmaVersion: number; sourceType: 'module' };
      rules: Record<string, unknown>;
    },
  ): LintMessage[];
}

interface ESLintModule {
  ESLint: new (options: { cwd: string; cache: boolean }) => ESLintLike;
  Linter: new () => LinterLike;
}

/**
 * ESLint 8 has no bundled types here. Load it through an untyped require
 * so the boundary test does not add `@types/eslint`.
 */
function loadEslint(): ESLintModule {
  return (require as unknown as (id: string) => ESLintModule)('eslint');
}

/**
 * The step-0 boundary is an eslint override. Prove two things:
 * the override is the config eslint assigns to that path, and that
 * config rejects the forbidden import.
 *
 * Verify the rule with ESLint's Linter, not a type-aware lint of a
 * temp file. On CI, typescript-eslint snapshots the program once
 * (`CI=true`), so a file rewritten after that snapshot is linted as
 * whatever it contained at the first parse.
 */
const apiRoot = path.resolve(__dirname, '../../..');

describe('transport boundary', () => {
  const eslintModule = loadEslint();
  const eslint = new eslintModule.ESLint({ cwd: apiRoot, cache: false });
  const linter = new eslintModule.Linter();

  async function restrictedMessages(filePath: string, source: string): Promise<LintMessage[]> {
    const config = await eslint.calculateConfigForFile(filePath);
    const rule = config.rules['no-restricted-imports'];
    return linter
      .verify(source, {
        parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'no-restricted-imports': rule },
      })
      .filter((message) => message.ruleId === 'no-restricted-imports');
  }

  it('rejects a repository import from a controller', async () => {
    const messages = await restrictedMessages(
      path.join(apiRoot, 'src/envelopes/envelopes.controller.ts'),
      "import { EnvelopesRepository } from './envelopes.repository';\nexport const boundaryProbe = EnvelopesRepository;\n",
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects a repository import from the MCP module', async () => {
    const messages = await restrictedMessages(
      path.join(apiRoot, 'src/mcp/boundary-probe.ts'),
      "import { EnvelopesRepository } from '../envelopes/envelopes.repository';\nexport const boundaryProbe = EnvelopesRepository;\n",
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects a direct database client import from a controller', async () => {
    const messages = await restrictedMessages(
      path.join(apiRoot, 'src/envelopes/envelopes.controller.ts'),
      "import { Kysely } from 'kysely';\nexport const boundaryProbe = Kysely;\n",
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects a controller import from a service', async () => {
    const messages = await restrictedMessages(
      path.join(apiRoot, 'src/envelopes/envelopes.service.ts'),
      "import { EnvelopesController } from './envelopes.controller';\nexport const boundaryProbe = EnvelopesController;\n",
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects a controller import from the MCP module', async () => {
    const messages = await restrictedMessages(
      path.join(apiRoot, 'src/mcp/tools.ts'),
      "import { EnvelopesController } from '../envelopes/envelopes.controller';\nexport const boundaryProbe = EnvelopesController;\n",
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it('allows a controller to import an application service', async () => {
    const messages = await restrictedMessages(
      path.join(apiRoot, 'src/envelopes/envelopes.controller.ts'),
      "import { EnvelopesService } from './envelopes.service';\nexport const boundaryProbe = EnvelopesService;\n",
    );
    expect(messages).toEqual([]);
  });

  it('allows a service to import a repository', async () => {
    const messages = await restrictedMessages(
      path.join(apiRoot, 'src/envelopes/envelopes.service.ts'),
      "import { EnvelopesRepository } from './envelopes.repository';\nexport const boundaryProbe = EnvelopesRepository;\n",
    );
    expect(messages).toEqual([]);
  });

  it('allows the envelopes controller source', async () => {
    const results = await eslint.lintFiles([
      path.join(apiRoot, 'src/envelopes/envelopes.controller.ts'),
    ]);
    const restricted = (results[0]?.messages ?? []).filter(
      (message) => message.ruleId === 'no-restricted-imports',
    );
    expect(restricted).toEqual([]);
  });

  it('allows the envelopes service source', async () => {
    const results = await eslint.lintFiles([
      path.join(apiRoot, 'src/envelopes/envelopes.service.ts'),
    ]);
    const restricted = (results[0]?.messages ?? []).filter(
      (message) => message.ruleId === 'no-restricted-imports',
    );
    expect(restricted).toEqual([]);
  });
});
