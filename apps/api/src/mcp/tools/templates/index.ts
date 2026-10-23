import type { McpTool } from '../../tool';
import { envelopesCreateFromTemplateTool } from './envelopes-create-from-template.tool';
import { templatesGetSchemaTool } from './templates-get-schema.tool';
import { templatesListTool } from './templates-list.tool';

/** Templates (WP-25, step 13). */
export const MCP_TEMPLATES_TOOLS: readonly McpTool[] = [
  templatesListTool,
  templatesGetSchemaTool,
  envelopesCreateFromTemplateTool,
];
