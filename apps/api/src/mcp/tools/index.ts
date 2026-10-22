import type { McpTool } from '../tool';
import { envelopesDownloadUrlTool } from './envelopes-download-url.tool';
import { envelopesGetTool } from './envelopes-get.tool';
import { envelopesListEventsTool } from './envelopes-list-events.tool';
import { envelopesListPendingTool } from './envelopes-list-pending.tool';
import { envelopesSearchTool } from './envelopes-search.tool';
import { envelopesStatusTool } from './envelopes-status.tool';
import { meGetTool } from './me-get.tool';

/**
 * Every shipped tool. A tool that is not shipped is absent, not stubbed.
 * Order is the `tools/list` order.
 */
export const MCP_TOOLS: readonly McpTool[] = [
  meGetTool,
  envelopesSearchTool,
  envelopesGetTool,
  envelopesStatusTool,
  envelopesDownloadUrlTool,
  envelopesListPendingTool,
  envelopesListEventsTool,
];
