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
 * type-aware parse would fail before the allowlist runs. The two
 * type-aware rules are off on this instance for the same reason. On
 * CI, typescript-eslint also snapshots that program once, so a
 * rewritten file on disk would lint as empty.
 *
 * Each case is a mutation: deleting the matching check, pattern, or
 * exclusion should fail that case. Messages are matched by rule id so
 * a generic package ban cannot stand in for the extractSignature text.
 */
const apiRoot = path.resolve(__dirname, '../../..');
const mcpFile = path.join(apiRoot, 'src/mcp/server.ts');
const deepFile = path.join(apiRoot, 'src/mcp/a/b/c/d/tool.ts');
const signingDepthFile = path.join(apiRoot, 'src/mcp/a/b/c/tool.ts');
const specFile = path.join(apiRoot, 'src/mcp/server.spec.ts');
const helperFile = path.join(apiRoot, 'src/mcp/__tests__/helper.ts');
const serviceFile = path.join(apiRoot, 'src/envelopes/envelopes.service.ts');
const boundaryService = path.join(apiRoot, 'src/envelopes/boundary.service.ts');

const ALLOW = 'seald/mcp-import-allowlist';
const REEXPORT = 'seald/no-service-repository-reexport';
const SYNTAX = 'no-restricted-syntax';
const IMPORTS = 'no-restricted-imports';

const OUTSIDE = 'other API modules';
const SIGNING = 'signing or sealing';
const STORAGE = 'does not import storage.service';
const KMS = 'does not import gdrive-kms.service';
const ABSOLUTE = 'absolute import paths';
const TESTS = 'under __tests__';
const NPM = 'Other packages stay out.';
const IMPORT_CALL = 'does not use import()';
const CREATE_REQUIRE = 'does not use createRequire.';
const DYNAMIC_REQUIRE = 'does not use a dynamic require()';
const EXTRACT = 'Do not use extractSignature';
const CAST = 'as unknown as';
const REEXPORT_MSG = 'must not re-export a repository';

function importing(specifier: string): string {
  return `import { boundary } from '${specifier}';\nexport const value = boundary;\n`;
}

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

  async function lint(filePath: string, source: string): Promise<readonly LintMessage[]> {
    const results = await eslint.lintText(source, { filePath });
    const result = results[0];
    expect(result).toBeDefined();
    expect(result?.fatalErrorCount ?? 0).toBe(0);
    return result?.messages ?? [];
  }

  function byRule(messages: readonly LintMessage[], ruleId: string): readonly string[] {
    return messages
      .filter((message) => message.ruleId === ruleId)
      .map((message) => message.message);
  }

  async function allowMessages(filePath: string, source: string): Promise<readonly string[]> {
    return byRule(await lint(filePath, source), ALLOW);
  }

  function expectDenied(messages: readonly string[], snippet: string): void {
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.join('\n')).toContain(snippet);
  }

  it('rejects a repository, including .js, .ts, and .pg forms', async () => {
    for (const specifier of [
      '../envelopes/envelopes.repository',
      '../envelopes/envelopes.repository.js',
      '../envelopes/envelopes.repository.ts',
      '../envelopes/envelopes.repository.pg',
    ]) {
      expectDenied(await allowMessages(mcpFile, importing(specifier)), OUTSIDE);
    }
  });

  it('rejects a controller, pdf inspection, and a Drive HTTP mapper', async () => {
    expectDenied(
      await allowMessages(mcpFile, importing('../envelopes/envelopes.controller')),
      OUTSIDE,
    );
    expectDenied(await allowMessages(mcpFile, importing('../envelopes/pdf-inspection')), OUTSIDE);
    expectDenied(
      await allowMessages(mcpFile, importing('../integrations/gdrive/drive-files.http-errors')),
      OUTSIDE,
    );
  });

  it('rejects path tricks that normalize outside src/mcp', async () => {
    expectDenied(
      await allowMessages(mcpFile, importing('./../envelopes/envelopes.repository')),
      OUTSIDE,
    );
    expectDenied(
      await allowMessages(mcpFile, importing('../mcp/../envelopes/envelopes.repository')),
      OUTSIDE,
    );
    expectDenied(
      await allowMessages(mcpFile, importing('../../src/envelopes/envelopes.repository')),
      OUTSIDE,
    );
    expectDenied(
      await allowMessages(mcpFile, importing('src/envelopes/envelopes.repository')),
      NPM,
    );
  });

  it('rejects five levels of ../ and still allows a service from that file', async () => {
    expectDenied(
      await allowMessages(deepFile, importing('../../../../../envelopes/envelopes.repository')),
      OUTSIDE,
    );
    expect(
      await allowMessages(deepFile, importing('../../../../../envelopes/envelopes.service')),
    ).toEqual([]);
  });

  it('rejects absolute paths even when they point at a service', async () => {
    const service = path.join(apiRoot, 'src/envelopes/envelopes.service.ts');
    const repository = path.join(apiRoot, 'src/envelopes/envelopes.repository.ts');
    expectDenied(await allowMessages(mcpFile, importing(service)), ABSOLUTE);
    expectDenied(await allowMessages(mcpFile, importing(repository)), ABSOLUTE);
  });

  it('rejects root files, the test directory, and a directory that does not exist yet', async () => {
    for (const specifier of ['../app.module.js', '../main.js', '../security-headers.js']) {
      expectDenied(await allowMessages(mcpFile, importing(specifier)), OUTSIDE);
    }
    expectDenied(await allowMessages(mcpFile, importing('../../test/calibration-grid')), OUTSIDE);
    expectDenied(
      await allowMessages(mcpFile, importing('../field-placement/field-placement.repository')),
      OUTSIDE,
    );
    expect(
      await allowMessages(mcpFile, importing('../field-placement/field-placement.service')),
    ).toEqual([]);
    expect(await allowMessages(mcpFile, importing('../envelopes/field-placement.service'))).toEqual(
      [],
    );
  });

  it('rejects the database, a guard, storage, and Drive KMS', async () => {
    expectDenied(await allowMessages(mcpFile, importing('../db/db.provider')), OUTSIDE);
    expectDenied(await allowMessages(mcpFile, importing('../auth/auth.guard')), OUTSIDE);
    expectDenied(await allowMessages(mcpFile, importing('../storage/storage.service')), STORAGE);
    expectDenied(await allowMessages(mcpFile, importing('../storage/storage.service.js')), STORAGE);
    expectDenied(
      await allowMessages(mcpFile, importing('../integrations/gdrive/gdrive-kms.service')),
      KMS,
    );
  });

  it('rejects signing and sealing services, including a deep file and a .js suffix', async () => {
    expectDenied(await allowMessages(mcpFile, importing('../signing/signing.service')), SIGNING);
    expectDenied(await allowMessages(mcpFile, importing('../sealing/sealing.service')), SIGNING);
    expectDenied(
      await allowMessages(mcpFile, importing('../signing/signer-session.service.js')),
      SIGNING,
    );
    expectDenied(
      await allowMessages(signingDepthFile, importing('../../../../signing/signing.service')),
      SIGNING,
    );
  });

  it('allows an application service, mapping .js onto the .ts file', async () => {
    expect(await allowMessages(mcpFile, importing('../envelopes/envelopes.service'))).toEqual([]);
    expect(await allowMessages(mcpFile, importing('../envelopes/envelopes.service.js'))).toEqual(
      [],
    );
    expect(
      await allowMessages(mcpFile, importing('../integrations/gdrive/drive-files.service')),
    ).toEqual([]);
  });

  it('allows shared, Nest, the MCP SDK, zod, and another file in src/mcp', async () => {
    expect(await allowMessages(mcpFile, importing('shared'))).toEqual([]);
    expect(await allowMessages(mcpFile, importing('@nestjs/common'))).toEqual([]);
    expect(await allowMessages(mcpFile, importing('@modelcontextprotocol/sdk'))).toEqual([]);
    expect(await allowMessages(mcpFile, importing('@modelcontextprotocol/sdk/server'))).toEqual([]);
    expect(
      await allowMessages(mcpFile, "import { z } from 'zod';\nexport const value = z;\n"),
    ).toEqual([]);
    expect(await allowMessages(mcpFile, importing('./tools/envelopes.tool'))).toEqual([]);
    expect(
      await allowMessages(mcpFile, importing('../../../../packages/shared/src/index.ts')),
    ).toEqual([]);
  });

  it('rejects packages outside the npm allowlist, including subpaths and node: forms', async () => {
    for (const specifier of [
      'pg',
      'pg/lib/client',
      'kysely',
      'kysely/helpers/postgres',
      'fs',
      'node:fs',
      'child_process',
      'node:child_process',
      'net',
      'node:net',
      '@supabase/supabase-js',
      '@aws-sdk/client-s3',
      '@aws-sdk/client-kms',
      'node-forge',
      '@signpdf/signpdf',
      '@nestjsfoo/common',
    ]) {
      expectDenied(await allowMessages(mcpFile, importing(specifier)), NPM);
    }
  });

  it('repeats the extractSignature ban inside the MCP override', async () => {
    const messages = await lint(mcpFile, "import { extractSignature } from '@signpdf/utils';\n");
    expect(byRule(messages, IMPORTS).join('\n')).toContain(EXTRACT);
    expect(byRule(messages, ALLOW).join('\n')).not.toContain('extractSignature');
    expectDenied(byRule(messages, ALLOW), NPM);
  });

  it('bans import() of a literal, a template, and a variable, including a service', async () => {
    const literal = await lint(
      mcpFile,
      "const loaded = import('../envelopes/envelopes.service');\nexport const value = loaded;\n",
    );
    const template = await lint(
      mcpFile,
      "const name = 'service';\nconst loaded = import(`../envelopes/${name}`);\nexport const value = loaded;\n",
    );
    const variable = await lint(
      mcpFile,
      "const spec = '../envelopes/envelopes.service';\nconst loaded = import(spec);\nexport const value = loaded;\n",
    );
    expect(byRule(literal, SYNTAX).join('\n')).toContain(IMPORT_CALL);
    expect(byRule(template, SYNTAX).join('\n')).toContain(IMPORT_CALL);
    expect(byRule(variable, SYNTAX).join('\n')).toContain(IMPORT_CALL);
  });

  it('bans createRequire calls, including the chained and member forms', async () => {
    const bare = await lint(mcpFile, 'createRequire(import.meta.url);\n');
    const chained = await lint(
      mcpFile,
      "createRequire(__filename)('../envelopes/envelopes.repository');\n",
    );
    const member = await lint(
      mcpFile,
      'const mod = { createRequire: (id: string) => id };\nmod.createRequire(import.meta.url);\n',
    );
    expect(byRule(bare, SYNTAX).join('\n')).toContain(CREATE_REQUIRE);
    expect(byRule(chained, SYNTAX).join('\n')).toContain(CREATE_REQUIRE);
    expect(byRule(member, SYNTAX).join('\n')).toContain(CREATE_REQUIRE);
  });

  it('bans a non-literal require and checks a literal require against the allowlist', async () => {
    const variable = await lint(
      mcpFile,
      "const spec = '../envelopes/envelopes.repository';\nconst loaded = require(spec);\nexport const value = loaded;\n",
    );
    const template = await lint(
      mcpFile,
      'const loaded = require(`../envelopes/envelopes.repository`);\nexport const value = loaded;\n',
    );
    expect(byRule(variable, SYNTAX).join('\n')).toContain(DYNAMIC_REQUIRE);
    expect(byRule(template, SYNTAX).join('\n')).toContain(DYNAMIC_REQUIRE);

    expectDenied(
      await allowMessages(
        mcpFile,
        "const loaded = require('../envelopes/envelopes.repository');\nexport const value = loaded;\n",
      ),
      OUTSIDE,
    );
    expect(
      await allowMessages(
        mcpFile,
        "const loaded = require('zod');\nexport const value = loaded;\n",
      ),
    ).toEqual([]);
    expect(
      await allowMessages(
        mcpFile,
        "const loaded = require('../envelopes/envelopes.service');\nexport const value = loaded;\n",
      ),
    ).toEqual([]);
    expect(
      await allowMessages(
        mcpFile,
        "import repo = require('../envelopes/envelopes.repository');\nexport const value = repo;\n",
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining(OUTSIDE)]));
  });

  it('rejects a type import and a re-export of a repository', async () => {
    expectDenied(
      await allowMessages(
        mcpFile,
        "import type { EnvelopesRepository } from '../envelopes/envelopes.repository';\nexport type { EnvelopesRepository };\n",
      ),
      OUTSIDE,
    );
    expectDenied(
      await allowMessages(
        mcpFile,
        "export { EnvelopesRepository } from '../envelopes/envelopes.repository';\n",
      ),
      OUTSIDE,
    );
    expectDenied(
      await allowMessages(mcpFile, "export * from '../envelopes/envelopes.repository';\n"),
      OUTSIDE,
    );
  });

  it('exempts only spec files, and production files cannot import tests', async () => {
    expect(await allowMessages(specFile, importing('../envelopes/envelopes.repository'))).toEqual(
      [],
    );
    expectDenied(
      await allowMessages(helperFile, importing('../../envelopes/envelopes.repository')),
      OUTSIDE,
    );
    expectDenied(await allowMessages(mcpFile, importing('./__tests__/helper')), TESTS);
    expectDenied(await allowMessages(mcpFile, importing('./tools/x.spec')), TESTS);
  });

  it('repeats the as-unknown-as ban in the MCP syntax override', async () => {
    const messages = await lint(
      mcpFile,
      'const value = 1 as unknown;\nexport const boundary = value as unknown as string;\n',
    );
    expect(byRule(messages, SYNTAX).join('\n')).toContain(CAST);
  });

  it('does not apply the allowlist to an application service', async () => {
    expect(
      await allowMessages(
        serviceFile,
        "import { EnvelopesRepository } from './envelopes.repository';\n",
      ),
    ).toEqual([]);
  });
});

describe('service repository re-exports', () => {
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

  async function reexports(source: string): Promise<readonly string[]> {
    const results = await eslint.lintText(source, { filePath: boundaryService });
    const result = results[0];
    expect(result).toBeDefined();
    expect(result?.fatalErrorCount ?? 0).toBe(0);
    return (result?.messages ?? [])
      .filter((message) => message.ruleId === REEXPORT)
      .map((message) => message.message);
  }

  it('rejects export-from and export-star of a repository', async () => {
    expect(
      await reexports("export { EnvelopesRepository } from './envelopes.repository';\n"),
    ).toEqual(expect.arrayContaining([expect.stringContaining(REEXPORT_MSG)]));
    expect(await reexports("export * from './envelopes.repository';\n")).toEqual(
      expect.arrayContaining([expect.stringContaining(REEXPORT_MSG)]),
    );
  });

  it('allows a normal import, a service re-export, and a local type export', async () => {
    expect(
      await reexports(
        "import { EnvelopesRepository } from './envelopes.repository';\nexport const value = EnvelopesRepository;\n",
      ),
    ).toEqual([]);
    expect(await reexports("export { EnvelopesService } from './envelopes.service';\n")).toEqual(
      [],
    );
    expect(await reexports('type ListResult = string;\nexport type { ListResult };\n')).toEqual([]);
  });
});
