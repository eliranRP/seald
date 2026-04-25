/**
 * Custom Jest transformer for yoga-layout's emscripten-emitted ESM bundle.
 *
 * The file `yoga-wasm-base64-esm.js` (loaded transitively from
 * `@react-pdf/renderer → @react-pdf/layout → yoga-layout/load`) is
 * pure-ESM in two ways jest's default CJS runner can't handle:
 *
 *   1. The IIFE captures `var _scriptDir = import.meta.url;`. `import.meta`
 *      is a module-only construct — it cannot be parsed under CJS.
 *   2. The trailer is `export default loadYoga;`.
 *
 * The wasm payload is base64-embedded in the same file, so `_scriptDir`
 * is never actually read at runtime. Both forms can be rewritten with
 * trivial string substitutions, after which the file is valid CJS.
 *
 * This avoids pulling in babel-jest (not present in the api workspace
 * deps) just to handle a single third-party file. It is intentionally
 * narrow: it only matches the literal `import.meta.url` token and the
 * single `export default <ident>;` trailer, and is only registered for
 * the one file via jest's `transform` map.
 */

module.exports = {
  process(sourceText) {
    let code = sourceText.replace(/import\.meta\.url/g, "''");
    code = code.replace(
      /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/,
      'module.exports = $1; module.exports.default = $1;',
    );
    return { code };
  },
  getCacheKey(sourceText, sourcePath) {
    // sourcePath alone is stable across the lockfile; we bump v? when
    // the regex rewrite changes.
    return `yoga-import-meta:v1:${sourcePath}:${sourceText.length}`;
  },
};
