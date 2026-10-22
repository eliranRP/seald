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

    const ctx = { principal, services: this.services, now };
    const data = parsed.data as Record<string, unknown>;
    const fail = (err: unknown): CallToolResult => {
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
    };

    // Dry run (step 8a): validate, write nothing, store no idempotency row.
    if (tool.mutating && data['dry_run'] === true) {
      try {
        const would = await (tool.preview ?? missingPreview)(data, ctx);
        return this.finish(tool, { dry_run: true, would }, done);
      } catch (err) {
        return fail(err);
      }
    }

    if (!tool.mutating) {
      let raw: unknown;
      try {
        raw = await tool.invoke(data, ctx);
      } catch (err) {
        return fail(err);
      }
      return this.finish(tool, raw, done);
    }

    // Idempotency (step 8a): `mcp:<key_id>:<client key>`, request hash over
    // the tool name and the arguments without the key.
    const begin = await this.services.idempotency.begin({
      ownerId: principal.ownerId,
      namespace: `mcp:${principal.keyId}`,
      clientKey: String(data['idempotency_key']),
      method: 'MCP',
      path: tool.name,
      args: data,
    });
    if (begin.kind === 'conflict') {
      done('idempotency_conflict');
      return errorResult(toolError('idempotency_conflict', { status: 409 }));
    }
    if (begin.kind === 'in_progress') {
      done('idempotency_in_progress');
      return errorResult(
        toolError('idempotency_in_progress', {
          status: 409,
          retryable: true,
          retry_after_seconds: 2,
        }),
      );
    }
    if (begin.kind === 'replay') return this.finish(tool, begin.body, done, 'replay');

    let result: CallToolResult;
    try {
      const raw = await tool.invoke(data, ctx);
      result = this.finish(tool, raw, done);
    } catch (err) {
      await this.services.idempotency.release(begin.handle);
      if (err instanceof McpError) throw err;
      return fail(err);
    }
    await this.services.idempotency.complete(begin.handle, result.structuredContent);
    return result;
  }

  /**
   * Parse the result through the output schema (dropping any key it does
   * not name), scan it for token-shaped strings, and wrap it.
   */
  private finish(
    tool: McpTool,
    raw: unknown,
    done: (slug: string) => void,
    slug = 'ok',
  ): CallToolResult {
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

    done(slug);
    const structured = output.data as Record<string, unknown>;
    return {
      content: [{ type: 'text', text: JSON.stringify(structured) }],
      structuredContent: structured,
    };
  }
}

async function missingPreview(): Promise<never> {
  throw new Error('mutating tool without preview');
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
