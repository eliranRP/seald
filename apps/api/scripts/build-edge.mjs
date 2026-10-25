#!/usr/bin/env node
// Bundles the compiled Nest API (dist/) into one ESM file for the Supabase
// Edge Function `seald` (AWS exit plan, WS-0).
//
// Run after `pnpm --filter api build`. Bundling the tsc output, not src/,
// keeps the decorator metadata tsc emits, which Nest DI needs and which the
// edge runtime's own TypeScript transform would drop.
//
// Output: supabase/functions/seald/dist/ (generated, git-ignored)
//   edge.mjs     the bundle
//   assets.mjs   the email templates, audit.pdf fonts and i18n catalogs,
//                base64-embedded. The bundle's `__dirname` points at a
//                virtual dir that supabase/functions/seald/asset-fs.ts serves
//                from memory, because the runtime blocks synchronous file
//                APIs once the entry module has evaluated. Layout under it:
//                  templates/  (template.service.ts reads __dirname/templates)
//                  fonts/      (audit-pdf.tsx reads __dirname/fonts)
//                  locales/    (t.ts falls back to __dirname/locales)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(apiRoot, '..', '..');
const outDir = resolve(repoRoot, 'supabase/functions/seald/dist');

// Packages the bundle must not inline: native addons, and optional modules
// that Nest, pg and others `require` lazily inside try/catch.
const external = [
  'pg-native',
  '@nestjs/microservices',
  '@nestjs/microservices/*',
  '@nestjs/websockets',
  '@nestjs/websockets/*',
  '@fastify/static',
  'class-transformer/storage',
];

// Deno resolves Node built-ins only with the `node:` prefix; esbuild keeps
// a bare `require('buffer')` as `import 'buffer'`, so add the prefix.
const nodeBuiltinPrefix = {
  name: 'node-builtin-prefix',
  setup(b) {
    const names = builtinModules
      .filter((m) => !m.startsWith('_'))
      .map((m) => m.replace(/\//g, '\\/'));
    const filter = new RegExp(`^(${names.join('|')})(\\/.*)?$`);
    b.onResolve({ filter }, (args) => ({ path: `node:${args.path}`, external: true }));
  },
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await build({
  // The tsc output is CommonJS, so an ESM bundle of it exposes only a
  // default export; re-export the named entry the function imports.
  stdin: {
    contents:
      "import edge from './dist/src/edge-main.js';\nexport const bootstrapEdge = edge.bootstrapEdge;\n",
    resolveDir: apiRoot,
    sourcefile: 'edge-entry.mjs',
  },
  outfile: resolve(outDir, 'edge.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  external,
  plugins: [nodeBuiltinPrefix],
  // Keep class and function names: Nest uses them for provider tokens and
  // log contexts.
  keepNames: true,
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
  banner: {
    js: [
      "import { createRequire as __sealdCreateRequire } from 'node:module';",
      "import { fileURLToPath as __sealdFileURLToPath } from 'node:url';",
      "import { dirname as __sealdDirname } from 'node:path';",
      // Deno exposes these Node globals to npm packages only, not to a
      // local module, and the inlined packages expect them.
      "import { Buffer as __sealdBuffer } from 'node:buffer';",
      "import __sealdProcess from 'node:process';",
      "import { setImmediate as __sealdSetImmediate, clearImmediate as __sealdClearImmediate } from 'node:timers';",
      'globalThis.Buffer ??= __sealdBuffer;',
      'globalThis.process ??= __sealdProcess;',
      'globalThis.global ??= globalThis;',
      'globalThis.setImmediate ??= __sealdSetImmediate;',
      'globalThis.clearImmediate ??= __sealdClearImmediate;',
      'const require = __sealdCreateRequire(import.meta.url);',
      'const __filename = __sealdFileURLToPath(import.meta.url);',
      // The function entry sets this to the virtual dir asset-fs.ts serves.
      'const __dirname = globalThis.__SEALD_ASSET_DIR ?? __sealdDirname(__filename);',
    ].join('\n'),
  },
});

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const assets = {};
for (const [prefix, dir] of [
  ['templates', resolve(apiRoot, 'src/email/templates')],
  ['fonts', resolve(apiRoot, 'src/sealing/fonts')],
  ['locales', resolve(repoRoot, 'packages/shared/locales')],
]) {
  for (const file of walk(dir)) {
    if (prefix === 'fonts' && !file.endsWith('.ttf')) continue;
    assets[`${prefix}/${relative(dir, file).split('\\').join('/')}`] =
      readFileSync(file).toString('base64');
  }
}
writeFileSync(
  resolve(outDir, 'assets.mjs'),
  `// Generated by apps/api/scripts/build-edge.mjs. Do not edit.\nexport default ${JSON.stringify(assets)};\n`,
);

const mb = (f) => (statSync(resolve(outDir, f)).size / 1024 / 1024).toFixed(2);
console.log(
  `edge bundle: ${outDir}/edge.mjs (${mb('edge.mjs')} MB), assets.mjs (${Object.keys(assets).length} files, ${mb('assets.mjs')} MB)`,
);
