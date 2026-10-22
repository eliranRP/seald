import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { API_KEY_SCOPES } from 'shared';
import { listTools } from '../tool-catalog';
import { MCP_TOOLS } from '../tools';
import { SHIPPED_STEPS } from '../route-coverage';

/** docs/design/mcp-server.md § Test plan: contract tests for the catalog. */
const TOOLS_DIR = join(__dirname, '..', 'tools');

const kebab = (name: string): string => name.replace(/_/g, '-');

describe('MCP tool catalog (contract)', () => {
  it('ships exactly the read tools of steps 4–6', () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([
      'me_get',
      'envelopes_search',
      'envelopes_get',
      'envelopes_status',
      'envelopes_download_url',
      'envelopes_list_pending',
      'envelopes_list_events',
    ]);
  });

  it('uses noun_verb names that never name signing, declining, submitting or disclosure', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.name).toMatch(/^[a-z]+(_[a-z0-9]+)+$/);
      expect(tool.name).not.toMatch(/sign|decline|submit|disclosure/);
    }
  });

  it('has unique names, and every tool belongs to a shipped step', () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of MCP_TOOLS) {
      expect(SHIPPED_STEPS as readonly string[]).toContain(tool.step);
    }
  });

  it('only uses catalogue scopes; every envelope read needs envelopes:read and nothing else', () => {
    for (const tool of MCP_TOOLS) {
      for (const scope of tool.scopes) expect(API_KEY_SCOPES).toContain(scope);
    }
    const meGet = MCP_TOOLS.find((t) => t.name === 'me_get');
    expect(meGet?.scopes).toEqual([]);
    for (const tool of MCP_TOOLS.filter((t) => t.name.startsWith('envelopes_'))) {
      expect(tool.scopes).toEqual(['envelopes:read']);
    }
  });

  it('marks every tool of this step read-only, not destructive, closed-world', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
    }
  });

  it('exempts a signed URL only on envelopes_download_url', () => {
    const exempt = MCP_TOOLS.filter((t) => (t.signedUrlFields ?? []).length > 0).map((t) => t.name);
    expect(exempt).toEqual(['envelopes_download_url']);
  });

  it('advertises object JSON schemas with no $schema and no extra input keys', () => {
    for (const listed of listTools()) {
      expect(listed.inputSchema.type).toBe('object');
      expect(listed.outputSchema.type).toBe('object');
      expect(listed.inputSchema).not.toHaveProperty('$schema');
      expect(listed.inputSchema['additionalProperties']).toBe(false);
    }
  });

  it('rejects an unknown field on every input schema', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.input.safeParse({ unexpected_field: 1 }).success).toBe(false);
    }
  });

  it('has a spec file for every tool file (glob)', () => {
    const toolFiles = readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.tool.ts'));
    const specs = new Set(readdirSync(join(TOOLS_DIR, '__tests__')));
    expect(toolFiles.length).toBe(MCP_TOOLS.length);
    for (const file of toolFiles) {
      expect(specs).toContain(file.replace(/\.tool\.ts$/, '.tool.spec.ts'));
    }
    for (const tool of MCP_TOOLS) {
      expect(toolFiles).toContain(`${kebab(tool.name)}.tool.ts`);
    }
  });
});
