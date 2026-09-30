'use strict';

const { bareModuleName, namesRepository, resolveRelative } = require('./resolve-specifier');

function isServiceFile(filename) {
  return /\.service\.tsx?$/.test(filename);
}

function reexportsRepository(filename, specifier) {
  if (namesRepository(specifier)) return true;
  if (!specifier.startsWith('.')) return false;
  return bareModuleName(resolveRelative(filename, specifier)).endsWith('.repository');
}

/**
 * A service may import a repository. It may not re-export one, because an
 * MCP file could then import that repository through the service name.
 * `export type { ListResult }` has no source and is left alone.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Stop a *.service.ts file from re-exporting a repository.',
    },
    schema: [],
    messages: {
      reexport: 'A *.service.ts file must not re-export a repository.',
    },
  },
  create(context) {
    const filename = context.getFilename();
    if (!isServiceFile(filename)) return {};

    function check(node) {
      if (!node.source || node.source.type !== 'Literal' || typeof node.source.value !== 'string') {
        return;
      }
      if (!reexportsRepository(filename, node.source.value)) return;
      context.report({ node: node.source, messageId: 'reexport' });
    }

    return {
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};
