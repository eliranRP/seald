import type { McpTool } from '../../tool';
import { envelopesSaveToDriveTool } from './envelopes-save-to-drive.tool';
import { gdriveDisconnectTool } from './gdrive-disconnect.tool';

/** Drive tools that always wait on the owner (WP-25, step 14). */
export const MCP_GDRIVE_WRITE_TOOLS: readonly McpTool[] = [
  gdriveDisconnectTool,
  envelopesSaveToDriveTool,
];
