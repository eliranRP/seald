import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface LintMessage {
  readonly ruleId: string | null;
  readonly message: string;
}

interface ESLintLike {
  lintFiles(patterns: string[]): Promise<Array<{ messages: LintMessage[] }>>;
}

interface ESLintModule {
  ESLint: new (options: { cwd: string; cache: boolean }) => ESLintLike;
}

/**
 * ESLint 8 has no bundled types here. Load it through an untyped require
 * so the boundary test does not add `@types/eslint`.
 */
function createLinter(cwd: string): ESLintLike {
  const eslint = (require as unknown as (id: string) => ESLintModule)('eslint');
  return new eslint.ESLint({ cwd, cache: false });
}

/**
 * The step-0 boundary is an eslint override, so the proof is eslint
 * itself: a controller or MCP file that imports a repository or the
 * database fails, and a service that imports a controller fails.
 * Application services may still import repositories.
 */
const apiRoot = path.resolve(__dirname, '../../..');

describe('transport boundary', () => {
  const probes = [
    path.join(apiRoot, 'src/mcp/boundary-probe.ts'),
    path.join(apiRoot, 'src/_boundary.controller.ts'),
    path.join(apiRoot, 'src/envelopes/_boundary.service.ts'),
  ];

  let eslint: ESLintLike;

  beforeAll(() => {
    mkdirSync(path.join(apiRoot, 'src/mcp'), { recursive: true });
    const stub = 'export const boundaryProbe = 1;\n';
    for (const file of probes) writeFileSync(file, stub);
    eslint = createLinter(apiRoot);
  });

  afterAll(() => {
    for (const file of probes) rmSync(file, { force: true });
    rmSync(path.join(apiRoot, 'src/mcp'), { recursive: true, force: true });
  });

  async function restrictedMessages(filePath: string, source: string): Promise<LintMessage[]> {
    writeFileSync(filePath, source);
    const results = await eslint.lintFiles([filePath]);
    return (results[0]?.messages ?? []).filter(
      (message) => message.ruleId === 'no-restricted-imports',
    );
  }

  it('rejects a repository import from a controller', async () => {
    const messages = await restrictedMessages(
      path.join(apiRoot, 'src/_boundary.controller.ts'),
      "import { EnvelopesRepository } from './envelopes/envelopes.repository';\nexport const boundaryProbe = EnvelopesRepository;\n",
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
      path.join(apiRoot, 'src/_boundary.controller.ts'),
      "import { Kysely } from 'kysely';\nexport const boundaryProbe = Kysely;\n",
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects a controller import from a service', async () => {
    const messages = await restrictedMessages(
      path.join(apiRoot, 'src/envelopes/_boundary.service.ts'),
      "import { EnvelopesController } from './envelopes.controller';\nexport const boundaryProbe = EnvelopesController;\n",
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it('allows the envelopes controller to import its service', async () => {
    const results = await eslint.lintFiles([
      path.join(apiRoot, 'src/envelopes/envelopes.controller.ts'),
    ]);
    const restricted = (results[0]?.messages ?? []).filter(
      (message) => message.ruleId === 'no-restricted-imports',
    );
    expect(restricted).toEqual([]);
  });

  it('allows a service to import a repository', async () => {
    const results = await eslint.lintFiles([
      path.join(apiRoot, 'src/envelopes/envelopes.service.ts'),
    ]);
    const restricted = (results[0]?.messages ?? []).filter(
      (message) => message.ruleId === 'no-restricted-imports',
    );
    expect(restricted).toEqual([]);
  });
});
