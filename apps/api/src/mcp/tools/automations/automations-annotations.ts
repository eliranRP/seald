import type { McpToolAnnotations } from '../../tool';

export const AUTOMATION_READ_ANNOTATIONS: McpToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** A recipe change can start sending data outside Seald, so the world is open. */
export const AUTOMATION_WRITE_ANNOTATIONS: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/** Both flags: the MCP surface itself, and the automations feature. */
export const AUTOMATION_FLAGS = ['mcpServer', 'workflowAutomations'] as const;
