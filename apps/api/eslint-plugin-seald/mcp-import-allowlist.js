'use strict';

const path = require('node:path');
const {
  apiRootFrom,
  bareModuleName,
  isInside,
  isServiceModule,
  isTestTarget,
  resolveRelative,
} = require('./resolve-specifier');

/**
 * Step 0d. Production files under `src/mcp` may import:
 * - another file inside `src/mcp` that is not a test
 * - an application `*.service.ts`, after `.js` → `.ts` resolution
 * - `packages/shared`, including a relative path that lands there
 * - the packages `shared`, `@nestjs/*`, `@modelcontextprotocol/sdk`, and `zod`
 *
 * Everything else is rejected. Signing, sealing, `storage.service`, and
 * `gdrive-kms.service` stay rejected even though they are services.
 * Absolute specifiers are rejected even when they point at a service.
 */
function isAllowedPackage(specifier) {
  if (specifier === 'shared' || specifier.startsWith('shared/')) return true;
  if (specifier.startsWith('@nestjs/')) return true;
  if (
    specifier === '@modelcontextprotocol/sdk' ||
    specifier.startsWith('@modelcontextprotocol/sdk/')
  ) {
    return true;
  }
  if (specifier === 'zod' || specifier.startsWith('zod/')) return true;
  return false;
}

function classify(filename, specifier) {
  if (path.isAbsolute(specifier) || specifier.startsWith('/')) return 'absolute';
  if (specifier.startsWith('.')) {
    const resolved = resolveRelative(filename, specifier);
    const root = apiRootFrom(filename);
    if (!root) return 'outside';
    if (isTestTarget(resolved)) return 'tests';
    if (isInside(resolved, path.join(root, 'src', 'mcp'))) return 'allow';
    if (
      isInside(resolved, path.join(root, 'src', 'signing')) ||
      isInside(resolved, path.join(root, 'src', 'sealing'))
    ) {
      return 'signing';
    }
    const stem = bareModuleName(resolved);
    if (stem === 'storage.service') return 'storage';
    if (stem === 'gdrive-kms.service') return 'kms';
    if (isServiceModule(resolved)) return 'allow';
    const sharedRoot = path.resolve(root, '..', '..', 'packages', 'shared');
    if (isInside(resolved, sharedRoot)) return 'allow';
    return 'outside';
  }
  if (isAllowedPackage(specifier)) return 'allow';
  return 'npm';
}

function report(context, node, specifier) {
  if (typeof specifier !== 'string') return;
  const kind = classify(context.getFilename(), specifier);
  if (kind === 'allow') return;
  context.report({ node, messageId: kind });
}

function literalSpecifier(node) {
  if (!node || node.type !== 'Literal' || typeof node.value !== 'string') return null;
  return node.value;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Allowlist src/mcp imports to application services, packages/shared, and a few runtime packages.',
    },
    schema: [],
    messages: {
      outside:
        'The MCP module may import application *.service.ts files and the shared package. It does not import controllers, repositories, HTTP mappers, or other API modules.',
      signing:
        'The MCP module does not import signing or sealing, including their *.service.ts files.',
      storage: 'The MCP module does not import storage.service.',
      kms: 'The MCP module does not import gdrive-kms.service.',
      absolute: 'The MCP module does not use absolute import paths.',
      tests:
        'The MCP module does not import test files, spec files, or anything under __tests__.',
      npm: 'The MCP module may import the shared package, @nestjs/*, @modelcontextprotocol/sdk, and zod. Other packages stay out.',
    },
  },
  create(context) {
    function checkSource(node) {
      if (!node.source) return;
      const specifier = literalSpecifier(node.source);
      if (specifier === null) return;
      report(context, node.source, specifier);
    }

    return {
      ImportDeclaration: checkSource,
      ExportAllDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
        const specifier = literalSpecifier(node.arguments[0]);
        if (specifier === null) return;
        report(context, node.arguments[0], specifier);
      },
      TSImportEqualsDeclaration(node) {
        const ref = node.moduleReference;
        if (!ref || ref.type !== 'TSExternalModuleReference') return;
        const specifier = literalSpecifier(ref.expression);
        if (specifier === null) return;
        report(context, ref.expression, specifier);
      },
    };
  },
};
