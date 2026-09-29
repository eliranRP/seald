import { describe, expect, it } from 'vitest';
// Plain JS helper used by eslint.config.js. It is outside the TS project.
// @ts-expect-error component-layers.mjs has no declaration file
import { buildComponentLayerZones, classifyComponentDirs } from '../../eslint/component-layers.mjs';

describe('component layer zones', () => {
  it('classifies Button as L1, NavBar as L3, and a folder with no story as L1', () => {
    const layers = classifyComponentDirs();
    expect(layers[1]).toContain('Button');
    expect(layers[3]).toContain('NavBar');
    expect(layers[1]).toContain('ColumnResizeHandle');
  });

  it('covers L1 with a negation glob so a new folder is checked without a name list', () => {
    const zones: ReadonlyArray<{ target: string; from: string; message: string }> =
      buildComponentLayerZones();
    const l1 = zones.find((zone) => zone.message.includes('L1'));
    expect(l1).toBeDefined();
    expect(l1?.target).toContain('!(');
    expect(String(l1?.target)).not.toContain('Button');
    expect(l1?.from).toContain('NavBar');
  });
});
