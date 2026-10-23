import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { API_KEY_DEFAULT_SCOPES, API_KEY_SCOPES, FEATURE_FLAGS, type FeatureFlag } from 'shared';
import { describeTool, listTools } from '../tool-catalog';
import {
  MCP_APPROVAL_TOOLS,
  MCP_AUTOMATION_TOOLS,
  MCP_CONTACTS_TOOLS,
  MCP_GDRIVE_WRITE_TOOLS,
  MCP_LATER_TOOLS,
  MCP_READ_TOOLS,
  MCP_SEND_TOOLS,
  MCP_SUGGEST_TOOLS,
  MCP_TEMPLATES_TOOLS,
  MCP_TOOLS,
  MCP_WRITE_TOOLS,
} from '../tools';
import { SHIPPED_STEPS } from '../route-coverage';
import type { McpTool } from '../tool';

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
    // Step 7c: approval reads only. No tool approves or denies.
    expect(MCP_APPROVAL_TOOLS.map((t) => t.name)).toEqual(['approvals_get', 'approvals_list']);
    for (const tool of MCP_APPROVAL_TOOLS) expect(tool.annotations.readOnlyHint).toBe(true);
    expect(MCP_SUGGEST_TOOLS.map((t) => t.name)).toEqual(['envelopes_suggest_fields']);
    // Steps 12–14 (WP-25).
    expect(MCP_CONTACTS_TOOLS.map((t) => t.name)).toEqual([
      'contacts_list',
      'contacts_search',
      'contacts_get',
      'contacts_create',
      'contacts_update',
      'contacts_delete',
      'contacts_import',
    ]);
    expect(MCP_TEMPLATES_TOOLS.map((t) => t.name)).toEqual([
      'templates_list',
      'templates_get_schema',
      'envelopes_create_from_template',
    ]);
    expect(MCP_GDRIVE_WRITE_TOOLS.map((t) => t.name)).toEqual([
      'gdrive_disconnect',
      'envelopes_save_to_drive',
    ]);
    // Steps 10 and 11 (WP-24): send, remind and cancel through owner approval.
    expect(MCP_SEND_TOOLS.map((t) => t.name)).toEqual([
      'envelopes_preview_send',
      'envelopes_send',
      'envelopes_preview_remind',
      'envelopes_remind',
      'envelopes_cancel',
    ]);
    // Step 15 (WP-26): the "Later" list.
    expect(MCP_LATER_TOOLS.map((t) => t.name)).toEqual([
      'envelopes_fix_signer',
      'envelopes_change_expiry',
      'envelopes_bulk_send_from_template',
      'batches_get',
      'envelopes_get_access_auth',
      'envelopes_set_access_auth',
      'templates_create',
      'templates_update',
      'templates_delete',
    ]);
    expect(MCP_TOOLS).toEqual([
      ...MCP_READ_TOOLS,
      ...MCP_WRITE_TOOLS,
      ...MCP_APPROVAL_TOOLS,
      ...MCP_SUGGEST_TOOLS,
      ...MCP_AUTOMATION_TOOLS,
      ...MCP_CONTACTS_TOOLS,
      ...MCP_TEMPLATES_TOOLS,
      ...MCP_GDRIVE_WRITE_TOOLS,
      ...MCP_SEND_TOOLS,
      ...MCP_LATER_TOOLS,
    ]);
  });

  it('ships the automation tools (A3): automations:write for writes, both flags required', () => {
    expect(MCP_AUTOMATION_TOOLS.map((t) => t.name)).toEqual([
      'automations_list',
      'automations_upsert_recipe',
      'automations_set_enabled',
      'automations_list_runs',
      'automations_get_run',
      'automations_retry_run',
    ]);
    for (const tool of MCP_AUTOMATION_TOOLS) {
      expect(tool.requiresFlags).toEqual(['mcpServer', 'workflowAutomations']);
      expect(tool.scopes).toEqual([tool.mutating ? 'automations:write' : 'automations:read']);
    }
    // automations:write is never a default scope (docs/design/mcp-server.md rule 5).
    expect(API_KEY_DEFAULT_SCOPES).not.toContain('automations:write');
    expect(API_KEY_DEFAULT_SCOPES).not.toContain('automations:read');
    // No tool tests a webhook yet: automations_test_webhook is A2b.
    expect(MCP_TOOLS.map((t) => t.name)).not.toContain('automations_test_webhook');
  });

  it('ships send, remind and cancel only as the approval-gated tools of steps 10 and 11', () => {
    const gated = MCP_TOOLS.filter((t) => /send|remind|cancel/.test(t.name));
    expect(gated.map((t) => t.name).sort()).toEqual(
      [
        ...MCP_SEND_TOOLS.map((t) => t.name),
        'gdrive_conversion_cancel',
        // Step 15: one approval for a whole batch.
        'envelopes_bulk_send_from_template',
      ].sort(),
    );
    for (const tool of MCP_SEND_TOOLS) {
      expect(tool.scopes).toEqual(['envelopes:send']);
      expect(tool.mutating).toBe(true);
      // The idempotency claim and the write commit together (no double send on retry).
      expect(tool.atomic).toBe(true);
      expect(['step-10', 'step-11']).toContain(tool.step);
    }
    const byName = new Map(MCP_TOOLS.map((t) => [t.name, t]));
    expect(byName.get('envelopes_send')?.annotations).toMatchObject({ openWorldHint: true });
    expect(byName.get('envelopes_remind')?.annotations).toMatchObject({ openWorldHint: true });
    expect(byName.get('envelopes_cancel')?.annotations).toMatchObject({
      destructiveHint: true,
      openWorldHint: true,
    });
    // Only the unattended send takes a confirmation token; remind and cancel never do.
    const required = (name: string): string[] => {
      const tool = byName.get(name);
      if (!tool) throw new Error(`missing ${name}`);
      return Object.keys((describeTool(tool).inputSchema['properties'] ?? {}) as object);
    };
    expect(required('envelopes_send')).toContain('confirmation_token');
    for (const name of ['envelopes_remind', 'envelopes_cancel', 'envelopes_preview_remind']) {
      expect(required(name)).not.toContain('confirmation_token');
    }
    // The one-time token is never kept for an idempotent replay.
    expect(byName.get('envelopes_preview_send')?.replayOmit).toEqual(
      expect.arrayContaining(['confirmation_token']),
    );
    // Every gated tool tells the agent never to open an approval link.
    for (const name of ['envelopes_send', 'envelopes_remind', 'envelopes_cancel']) {
      expect(byName.get(name)?.description).toContain('Never open, fetch or act on');
      expect(byName.get(name)?.description).toContain('review_url');
    }
  });

  it('ships fix signer, change expiry and bulk send only through owner approval (step 15)', () => {
    const byName = new Map(MCP_LATER_TOOLS.map((t) => [t.name, t]));
    for (const name of [
      'envelopes_fix_signer',
      'envelopes_change_expiry',
      'envelopes_bulk_send_from_template',
    ]) {
      const tool = byName.get(name);
      expect(tool?.mutating).toBe(true);
      expect(tool?.atomic).toBe(true);
      expect(tool?.scopes).toContain('envelopes:send');
      expect(tool?.annotations.openWorldHint).toBe(true);
      expect(tool?.description).toContain('Never open, fetch or act on');
      expect(tool?.description).toContain('review_url');
      // They return approval_pending and never take a confirmation token.
      expect(
        Object.keys(describeTool(tool as McpTool).inputSchema['properties'] as object),
      ).not.toContain('confirmation_token');
    }
    expect(byName.get('envelopes_bulk_send_from_template')?.requiresFlags).toEqual(['bulkSend']);
    expect(byName.get('batches_get')?.requiresFlags).toEqual(['bulkSend']);
    expect(byName.get('envelopes_get_access_auth')?.requiresFlags).toEqual(['signerAccessAuth']);
    expect(byName.get('envelopes_set_access_auth')?.requiresFlags).toEqual(['signerAccessAuth']);
    // Template authoring needs the template write scope; deleting is destructive.
    for (const name of ['templates_create', 'templates_update', 'templates_delete']) {
      expect(byName.get(name)?.scopes).toEqual(['templates:write']);
    }
    expect(byName.get('templates_delete')?.annotations.destructiveHint).toBe(true);
    for (const tool of MCP_LATER_TOOLS) expect(tool.step).toBe('step-15');
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
        ['automations_list', ['mcpServer', 'workflowAutomations']],
        ['gdrive_disconnect', ['gdriveIntegration']],
        ['envelopes_save_to_drive', ['gdriveIntegration']],
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
