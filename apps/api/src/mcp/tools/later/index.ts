import type { McpTool } from '../../tool';
import { batchesGetTool } from './batches-get.tool';
import { envelopesBulkSendFromTemplateTool } from './envelopes-bulk-send-from-template.tool';
import { envelopesChangeExpiryTool } from './envelopes-change-expiry.tool';
import { envelopesFixSignerTool } from './envelopes-fix-signer.tool';
import { envelopesGetAccessAuthTool } from './envelopes-get-access-auth.tool';
import { envelopesSetAccessAuthTool } from './envelopes-set-access-auth.tool';
import { templatesCreateTool } from './templates-create.tool';
import { templatesDeleteTool } from './templates-delete.tool';
import { templatesUpdateTool } from './templates-update.tool';

/**
 * The "Later" list (WP-26, step 15). Fix a signer, change an expiry and
 * bulk send wait on the owner; the access-code and template authoring
 * tools act at once on drafts and templates.
 */
export const MCP_LATER_TOOLS: readonly McpTool[] = [
  envelopesFixSignerTool,
  envelopesChangeExpiryTool,
  envelopesBulkSendFromTemplateTool,
  batchesGetTool,
  envelopesGetAccessAuthTool,
  envelopesSetAccessAuthTool,
  templatesCreateTool,
  templatesUpdateTool,
  templatesDeleteTool,
];
