/**
 * Component layer zones for `import/no-restricted-paths`.
 *
 * Every directory under `src/components` is included. The layer comes from
 * the folder's Storybook title (`L1/` … `L4/`). A folder with no story is
 * L1, so a new component is checked immediately and cannot import a higher
 * layer until its story says otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const componentsRoot = path.join(webRoot, 'src/components');

function layerFromStories(dir) {
  /** @type {number | null} */
  let found = null;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.name.endsWith('.stories.tsx')) continue;
      const text = fs.readFileSync(full, 'utf8');
      const match = text.match(/title:\s*['"]L([1-4])\//);
      if (!match?.[1]) continue;
      const layer = Number(match[1]);
      found = found === null ? layer : Math.max(found, layer);
    }
  }
  return found ?? 1;
}

/** @returns {Record<1 | 2 | 3 | 4, string[]>} */
export function classifyComponentDirs() {
  /** @type {Record<1 | 2 | 3 | 4, string[]>} */
  const layers = { 1: [], 2: [], 3: [], 4: [] };
  for (const entry of fs.readdirSync(componentsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const layer = layerFromStories(path.join(componentsRoot, entry.name));
    layers[/** @type {1 | 2 | 3 | 4} */ (layer)].push(entry.name);
  }
  for (const names of Object.values(layers)) names.sort();
  return layers;
}

function brace(names) {
  return `{${names.join(',')}}`;
}

/**
 * @returns {Array<{ target: string, from: string, message: string }>}
 */
export function buildComponentLayerZones() {
  const layers = classifyComponentDirs();
  /** @type {Array<{ target: string, from: string, message: string }>} */
  const zones = [];
  for (const layer of [1, 2, 3]) {
    const higher = [2, 3, 4].filter((n) => n > layer).flatMap((n) => layers[/** @type {1 | 2 | 3 | 4} */ (n)]);
    const own = layers[/** @type {1 | 2 | 3 | 4} */ (layer)];
    if (own.length === 0 || higher.length === 0) continue;
    // L1 is every component folder that is not a higher layer, including
    // folders that do not exist yet. L2/L3 stay an explicit brace of the
    // folders whose stories declare that layer.
    const target =
      layer === 1
        ? `./src/components/!(${higher.join('|')})/**`
        : `./src/components/${brace(own)}/**`;
    zones.push({
      target,
      from: `./src/components/${brace(higher)}/**`,
      message: `Layer boundary: L${layer} components must not import from a higher component layer.`,
    });
  }
  return zones;
}
