import { isFeatureEnabled } from 'shared';
import { toToolJsonSchema, type JsonSchemaObject } from './json-schema';
import type { McpTool } from './tool';
import { MCP_TOOLS } from './tools';

/** One `tools/list` entry, as the client sees it. */
export interface ListedTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonSchemaObject;
  readonly outputSchema: JsonSchemaObject;
  readonly annotations: {
    readonly title: string;
    readonly readOnlyHint: boolean;
    readonly destructiveHint: boolean;
    readonly idempotentHint: boolean;
    readonly openWorldHint: boolean;
  };
  readonly _meta: { readonly 'seald/scopes': readonly string[] };
}

/** Tools whose flags are all on right now. */
export function availableTools(tools: readonly McpTool[] = MCP_TOOLS): McpTool[] {
  return tools.filter((t) => (t.requiresFlags ?? []).every((flag) => isFeatureEnabled(flag)));
}

export function findTool(name: string, tools: readonly McpTool[] = MCP_TOOLS): McpTool | undefined {
  return availableTools(tools).find((t) => t.name === name);
}

export function describeTool(tool: McpTool): ListedTool {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: toToolJsonSchema(tool.input, 'input'),
    outputSchema: toToolJsonSchema(tool.output, 'output'),
    annotations: { title: tool.title, ...tool.annotations },
    _meta: { 'seald/scopes': [...tool.scopes] },
  };
}

/** The `tools/list` result body for the current flags. */
export function listTools(tools: readonly McpTool[] = MCP_TOOLS): ListedTool[] {
  return availableTools(tools).map(describeTool);
}
