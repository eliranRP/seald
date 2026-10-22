import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolError } from 'shared';
import { hasScopes, type ApiKeyPrincipal } from '../api-keys/api-key-auth.service';
import { findTokenShapedStrings } from './leak-scan';
import { McpServices } from './mcp-services';
import { findTool } from './tool-catalog';
import { mapToolFailure, toolError } from './tool-errors';
import type { McpTool } from './tool';
import { MCP_TOOLS } from './tools';

/**
 * Runs one `tools/call`: find the tool, check scopes (credential ∩ tool
 * requirement), validate the arguments against the strict input schema,
 * call the handler, then parse the result through the output schema
 * (which drops any key the schema does not name) and scan it for
 * token-shaped strings.
 *
 * Expected failures are tool errors (HTTP 200, `isError: true`) carrying
 * the same slug `HttpExceptionFilter` would. Logs hold the tool name,
 * owner id, key id, slug and duration only: never argument values,
 * document text or signer data.
 */
@Injectable()
export class McpToolRunner {
  private readonly log = new Logger('McpToolRunner');

  constructor(private readonly services: McpServices) {}

  /** Overridable in tests to run a custom catalog. */
  protected tools(): readonly McpTool[] {
    return MCP_TOOLS;
  }

  async call(
    name: string,
    rawArgs: Record<string, unknown> | undefined,
    principal: ApiKeyPrincipal,
    now: Date = new Date(),
  ): Promise<CallToolResult> {
    const started = Date.now();
    const tool = findTool(name, this.tools());
    if (!tool) {
      // Same answer as a name that never existed (e.g. a signing tool).
      throw new McpError(ErrorCode.InvalidParams, 'Tool not found');
    }
    const args = rawArgs ?? {};
    const done = (slug: string): void => {
      this.log.log(
        `tool=${tool.name} owner=${principal.ownerId} key=${principal.keyId} slug=${slug} ms=${Date.now() - started}`,
      );
    };

    if (!hasScopes(principal, tool.scopes)) {
      done('insufficient_scope');
      return errorResult(toolError('insufficient_scope', { status: 403 }));
    }

    const parsed = tool.input.safeParse(args);
    if (!parsed.success) {
      done('validation_error');
      return errorResult(toolError('validation_error'));
    }

    let raw: unknown;
    try {
      raw = await tool.invoke(parsed.data, { principal, services: this.services, now });
    } catch (err) {
      const mapped = mapToolFailure(err, args);
      if (mapped) {
        done(mapped.slug);
        return errorResult(mapped);
      }
      this.log.error(
        `tool=${tool.name} owner=${principal.ownerId} key=${principal.keyId} slug=internal_error ` +
          `type=${err instanceof Error ? err.name : typeof err}`,
      );
      throw new McpError(ErrorCode.InternalError, 'internal_error');
    }

    const output = tool.output.safeParse(raw);
    if (!output.success) {
      this.log.error(`tool=${tool.name} slug=internal_error reason=output_schema`);
      throw new McpError(ErrorCode.InternalError, 'internal_error');
    }
    const leaks = findTokenShapedStrings(output.data, {
      ...(tool.signedUrlFields ? { signedUrlFields: tool.signedUrlFields } : {}),
    });
    if (leaks.length > 0) {
      this.log.error(
        `tool=${tool.name} slug=internal_error reason=token_shaped_output patterns=${leaks
          .map((l) => l.pattern)
          .join(',')}`,
      );
      throw new McpError(ErrorCode.InternalError, 'internal_error');
    }

    done('ok');
    const structured = output.data as Record<string, unknown>;
    return {
      content: [{ type: 'text', text: JSON.stringify(structured) }],
      structuredContent: structured,
    };
  }
}

/**
 * The error body goes in the text content (and, for hosts that read the
 * raw result, at the top level). No `structuredContent`: a client
 * validates that against the tool's output schema.
 */
function errorResult(error: McpToolError): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(error) }],
    ...error,
  };
}
