import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MCP_SERVER_VERSION } from 'shared';
import type { McpPrincipal } from './mcp-principal';
import { listTools } from './tool-catalog';
import type { McpToolRunner } from './tool-runner';

/**
 * One SDK server per request (stateless Streamable HTTP). The SDK
 * `McpServer` would convert Zod schemas itself and rewrite validation
 * errors, so the request handlers are set on its underlying protocol
 * server instead: `tools/list` advertises our `z.toJSONSchema` output
 * verbatim and `tools/call` goes through `McpToolRunner`, which returns
 * the design doc's error slugs.
 *
 * Resources and prompts are advertised (the doc's `initialize` shape)
 * with empty lists until their pull request ships them.
 */
export function createMcpServer(runner: McpToolRunner, principal: McpPrincipal): McpServer {
  const mcp = new McpServer(
    { name: 'seald', version: MCP_SERVER_VERSION },
    { capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} } },
  );
  const server = mcp.server;
  // SDK >= 1.32.2 installs its own handlers for the declared capabilities and
  // sets tools.listChanged to true. This server is stateless and never sends
  // list-changed notifications, so restore false before connect().
  server.registerCapabilities({ tools: { listChanged: false } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    runner.call(req.params.name, req.params.arguments, principal),
  );
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
  server.setRequestHandler(ReadResourceRequestSchema, async () => {
    throw new McpError(ErrorCode.InvalidParams, 'Resource not found');
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));
  server.setRequestHandler(GetPromptRequestSchema, async () => {
    throw new McpError(ErrorCode.InvalidParams, 'Prompt not found');
  });
  return mcp;
}
