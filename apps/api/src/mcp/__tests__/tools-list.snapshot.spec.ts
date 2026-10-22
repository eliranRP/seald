import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURE_FLAGS, MCP_SERVER_VERSION, type FeatureFlag } from 'shared';
import { classifyToolsChange, minorOf, type SnapshotTool } from '../snapshot-classifier';
import { listTools } from '../tool-catalog';

/**
 * `tools-list.snapshot.json` holds names, descriptions, schemas and
 * annotations twice: every flag on, and every flag on but
 * `gdriveIntegration`. A change fails until the snapshot is updated:
 *
 *   UPDATE_MCP_SNAPSHOT=1 pnpm --filter api test -- tools-list.snapshot
 *
 * An additive change also needs a minor bump of MCP_SERVER_VERSION in
 * packages/shared/src/mcp.ts. A breaking change is refused unless the
 * same change adds a `<tool>_v2`.
 */
const SNAPSHOT = join(__dirname, '..', 'tools-list.snapshot.json');

interface Snapshot {
  readonly server_version: string;
  readonly variants: Readonly<Record<'all_flags_on' | 'gdrive_off', readonly SnapshotTool[]>>;
}

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

function withFlags<T>(overrides: Partial<Record<FeatureFlag, boolean>>, fn: () => T): T {
  const all = Object.fromEntries(Object.keys(FEATURE_FLAGS).map((k) => [k, true])) as Record<
    FeatureFlag,
    boolean
  >;
  host.__SEALD_FEATURE_OVERRIDES__ = { ...all, ...overrides };
  try {
    return fn();
  } finally {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  }
}

function current(): Snapshot['variants'] {
  const plain = (tools: unknown): SnapshotTool[] => JSON.parse(JSON.stringify(tools));
  return {
    all_flags_on: withFlags({}, () => plain(listTools())),
    gdrive_off: withFlags({ gdriveIntegration: false }, () => plain(listTools())),
  };
}

function readSnapshot(): Snapshot | null {
  try {
    return JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Snapshot;
  } catch {
    return null;
  }
}

describe('tools/list snapshot', () => {
  it('matches the committed snapshot, or the change is classified and versioned', () => {
    const now = current();
    const committed = readSnapshot();
    const update = process.env.UPDATE_MCP_SNAPSHOT === '1';

    if (!committed) {
      if (!update)
        throw new Error('tools-list.snapshot.json is missing; run with UPDATE_MCP_SNAPSHOT=1');
      writeFileSync(
        SNAPSHOT,
        `${JSON.stringify({ server_version: MCP_SERVER_VERSION, variants: now }, null, 2)}\n`,
      );
      return;
    }

    const results = (['all_flags_on', 'gdrive_off'] as const).map((v) =>
      classifyToolsChange(committed.variants[v], now[v]),
    );
    const breaking = results.flatMap((r) => (r.kind === 'breaking' ? r.reasons : []));
    const additive = results.flatMap((r) => (r.kind === 'additive' ? r.reasons : []));

    if (breaking.length > 0) {
      throw new Error(
        `Breaking tools/list change; add a <tool>_v2 instead:\n  ${breaking.join('\n  ')}`,
      );
    }
    if (additive.length === 0) {
      expect(committed.server_version).toBe(MCP_SERVER_VERSION);
      return;
    }
    const sameMajor = committed.server_version.split('.')[0] === MCP_SERVER_VERSION.split('.')[0];
    if (!sameMajor || minorOf(MCP_SERVER_VERSION) <= minorOf(committed.server_version)) {
      throw new Error(
        `Additive tools/list change; bump the minor of MCP_SERVER_VERSION (now ${MCP_SERVER_VERSION}):\n  ${additive.join('\n  ')}`,
      );
    }
    if (!update) {
      throw new Error(
        `tools/list changed (additive); run with UPDATE_MCP_SNAPSHOT=1:\n  ${additive.join('\n  ')}`,
      );
    }
    writeFileSync(
      SNAPSHOT,
      `${JSON.stringify({ server_version: MCP_SERVER_VERSION, variants: now }, null, 2)}\n`,
    );
  });
});
