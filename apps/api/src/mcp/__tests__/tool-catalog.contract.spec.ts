import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { API_KEY_SCOPES, FEATURE_FLAGS, type FeatureFlag } from 'shared';
import { describeTool, listTools } from '../tool-catalog';
import { MCP_READ_TOOLS, MCP_TOOLS, MCP_WRITE_TOOLS } from '../tools';
import { SHIPPED_STEPS } from '../route-coverage';

/** docs/design/mcp-server.md § Test plan: contract tests for the catalog. */
const TOOLS_DIR = join(__dirname, '..', 'tools');

const kebab = (name: string): string => name.replace(/_/g, '-');

/** Every `*.tool.ts` under tools/, relative to it (subfolders included). */
function toolFiles(dir: string = TOOLS_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : toolFiles(full);
    return entry.name.endsWith('.tool.ts') ? [relative(TOOLS_DIR, full)] : [];
  });
}

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

describe('MCP tool catalog (contract)', () => {
  it('ships the read tools of steps 4–6 and the draft tools of steps 8a–8d', () => {
    expect(MCP_READ_TOOLS.map((t) => t.name)).toEqual([
      'me_get',
      'envelopes_search',
      'envelopes_get',
      'envelopes_status',
      'envelopes_download_url',
      'envelopes_list_pending',
      'envelopes_list_events',
    ]);
    expect(MCP_WRITE_TOOLS.map((t) => t.name)).toEqual([
      'documents_upload',
      'documents_upload_start',
      'documents_upload_complete',
      'envelopes_upload_pdf',
      'envelopes_add_document',
      'gdrive_list_accounts',
      'gdrive_connect_url',
      'gdrive_list_files',
      'gdrive_search_files',
      'gdrive_import',
      'gdrive_conversion_status',
      'gdrive_conversion_cancel',
      'envelopes_create',
      'envelopes_update',
      'envelopes_delete_draft',
      'envelopes_add_signer',
      'envelopes_remove_signer',
      'envelopes_place_fields',
      'envelopes_set_recipient_order',
      'envelopes_reorder_documents',
      'envelopes_remove_document',
      'envelopes_prepare',
    ]);
    expect(MCP_TOOLS).toEqual([...MCP_READ_TOOLS, ...MCP_WRITE_TOOLS]);
  });

  it('ships no send, remind or cancel tool before the approval steps', () => {
    for (const tool of MCP_TOOLS) expect(tool.name).not.toMatch(/send|remind|cancel_envelope/);
  });

  it('uses noun_verb names that never name signing, declining, submitting or disclosure', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.name).toMatch(/^[a-z]+(_[a-z0-9]+)+$/);
      // The noun "signer" (envelopes_add_signer, as the doc names it) is
      // allowed; the act of signing is not.
      expect(tool.name).not.toMatch(/(^|_)sign(_|$)|signing|signature|decline|submit|disclosure/);
    }
  });

  it('has unique names, and every tool belongs to a shipped step', () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of MCP_TOOLS) {
      expect(SHIPPED_STEPS as readonly string[]).toContain(tool.step);
    }
  });

  it('only uses catalogue scopes, least privilege per family', () => {
    for (const tool of MCP_TOOLS) {
      for (const scope of tool.scopes) expect(API_KEY_SCOPES).toContain(scope);
    }
    const meGet = MCP_TOOLS.find((t) => t.name === 'me_get');
    expect(meGet?.scopes).toEqual([]);
    // envelopes:read covers reads only and does not imply anything else.
    for (const tool of MCP_READ_TOOLS.filter((t) => t.name.startsWith('envelopes_'))) {
      expect(tool.scopes).toEqual(['envelopes:read']);
    }
    for (const tool of MCP_WRITE_TOOLS) {
      if (tool.name.startsWith('documents_')) expect(tool.scopes).toEqual(['documents:write']);
      if (tool.name.startsWith('gdrive_')) expect(tool.scopes).toContain('gdrive:read');
      if (tool.name.startsWith('envelopes_')) expect(tool.scopes).toContain('envelopes:write');
      expect(tool.scopes).not.toContain('envelopes:send');
    }
    expect(MCP_TOOLS.find((t) => t.name === 'gdrive_import')?.scopes).toEqual([
      'gdrive:read',
      'documents:write',
    ]);
  });

  it('marks read tools read-only, not destructive, closed-world', () => {
    for (const tool of MCP_READ_TOOLS) {
      expect(tool.mutating).toBe(false);
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
    }
  });

  it('makes every mutating tool require idempotency_key and dry_run, and only those', () => {
    for (const tool of MCP_TOOLS) {
      const listed = describeTool(tool);
      const required = (listed.inputSchema['required'] ?? []) as string[];
      if (tool.mutating) {
        expect({ name: tool.name, readOnly: tool.annotations.readOnlyHint }).toEqual({
          name: tool.name,
          readOnly: false,
        });
        expect(required).toEqual(expect.arrayContaining(['idempotency_key', 'dry_run']));
        expect(typeof tool.preview).toBe('function');
      } else {
        expect(required).not.toContain('idempotency_key');
        expect(tool.annotations.readOnlyHint).toBe(true);
      }
    }
  });

  it('hides each flagged tool while its flag is off', () => {
    const flagged = MCP_TOOLS.filter((t) => (t.requiresFlags ?? []).length > 0);
    expect(flagged.map((t) => [t.name, t.requiresFlags])).toEqual(
      expect.arrayContaining([
        ['envelopes_add_document', ['multiDocumentEnvelopes']],
        ['envelopes_reorder_documents', ['multiDocumentEnvelopes']],
        ['envelopes_remove_document', ['multiDocumentEnvelopes']],
        ['envelopes_set_recipient_order', ['signingOrder']],
        ['gdrive_import', ['gdriveIntegration']],
      ]),
    );
    const all = Object.fromEntries(Object.keys(FEATURE_FLAGS).map((k) => [k, true]));
    for (const tool of flagged) {
      for (const flag of tool.requiresFlags ?? []) {
        host.__SEALD_FEATURE_OVERRIDES__ = { ...all, [flag]: false };
        try {
          expect(listTools().map((t) => t.name)).not.toContain(tool.name);
        } finally {
          delete host.__SEALD_FEATURE_OVERRIDES__;
        }
      }
    }
  });

  it('exempts a signed URL only on envelopes_download_url and documents_upload_start', () => {
    const exempt = MCP_TOOLS.filter((t) => (t.signedUrlFields ?? []).length > 0).map((t) => [
      t.name,
      t.signedUrlFields,
    ]);
    expect(exempt).toEqual([
      ['envelopes_download_url', ['url']],
      ['documents_upload_start', ['upload_url']],
    ]);
  });

  it('advertises object JSON schemas with no $schema and no extra input keys', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = Object.fromEntries(
      Object.keys(FEATURE_FLAGS).map((k) => [k, true]),
    ) as Record<FeatureFlag, boolean>;
    try {
      for (const listed of listTools()) {
        expect(listed.inputSchema.type).toBe('object');
        expect(listed.outputSchema.type).toBe('object');
        expect(listed.inputSchema).not.toHaveProperty('$schema');
        expect(listed.inputSchema['additionalProperties']).toBe(false);
      }
    } finally {
      delete host.__SEALD_FEATURE_OVERRIDES__;
    }
  });

  it('rejects an unknown field on every input schema', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.input.safeParse({ unexpected_field: 1 }).success).toBe(false);
    }
  });

  it('has a spec file for every tool file (glob, subfolders included)', () => {
    const files = toolFiles();
    expect(files.length).toBe(MCP_TOOLS.length);
    for (const file of files) {
      const dir = join(TOOLS_DIR, file, '..');
      const specs = new Set(readdirSync(join(dir, '__tests__')));
      const base = file.split('/').pop() ?? file;
      expect({ file, spec: specs.has(base.replace(/\.tool\.ts$/, '.tool.spec.ts')) }).toEqual({
        file,
        spec: true,
      });
    }
    const basenames = files.map((f) => f.split('/').pop());
    for (const tool of MCP_TOOLS) {
      expect(basenames).toContain(`${kebab(tool.name)}.tool.ts`);
    }
  });
});
