import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Response } from 'express';
import { MCP_PROTOCOL_VERSIONS, isSupportedMcpProtocolVersion } from 'shared';
import { Public } from '../auth/public.decorator';
import { MCP_PRINCIPAL, McpAuthGuard, McpFlagGuard, type McpRequest } from './mcp-auth.guard';
import { createMcpServer } from './mcp-server.factory';
import { McpToolRunner } from './tool-runner';

/**
 * Remote MCP endpoint (docs/design/mcp-server.md, Transport): stateless
 * Streamable HTTP. Every `POST /mcp` builds a fresh SDK server and
 * transport, answers in the POST body (`enableJsonResponse`, no SSE, no
 * `Mcp-Session-Id`) and closes both when the response ends. The global
 * 30-second `requestTimeout` stays as it is.
 *
 * `@Public()` opts out of the Supabase-only global AuthGuard;
 * `McpAuthGuard` is the credential check. `McpFlagGuard` runs first on
 * every method, so a dark surface is a 404 before auth.
 *
 * The MCP buckets replace the global ones (10/s, 30/min, 300/h).
 */
@Public()
@Controller('mcp')
@UseGuards(McpFlagGuard)
@Throttle({
  short: { limit: 10, ttl: 1000 },
  medium: { limit: 30, ttl: 60_000 },
  long: { limit: 300, ttl: 3_600_000 },
})
export class McpController {
  private readonly log = new Logger(McpController.name);

  constructor(private readonly runner: McpToolRunner) {}

  @Post()
  @UseGuards(McpAuthGuard)
  async post(@Req() req: McpRequest, @Res() res: Response): Promise<void> {
    const principal = req[MCP_PRINCIPAL];
    if (!principal) throw new UnauthorizedException('missing_token');

    // Every POST checks the header. A value we do not speak is HTTP 400,
    // not a JSON-RPC error. A missing header is allowed: `initialize`
    // has none, and the spec lets later calls fall back.
    const header = req.headers['mcp-protocol-version'];
    if (header !== undefined && !isSupportedMcpProtocolVersion(header)) {
      throw new BadRequestException('unsupported_protocol_version');
    }

    const server = createMcpServer(this.runner, principal);
    // No `sessionIdGenerator`: stateless mode, no `Mcp-Session-Id`.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    res.on('close', () => {
      void transport.close().catch(() => undefined);
      void server.close().catch(() => undefined);
    });
    try {
      // The SDK's own class misses its `Transport` type only under our
      // `exactOptionalPropertyTypes` (optional callbacks typed `| undefined`).
      await server.connect(transport as Transport);
      await transport.handleRequest(req, res, pinProtocolVersion(req.body));
    } catch (err) {
      // No request data, no bearer header: the type only.
      this.log.error(`mcp transport failure type=${err instanceof Error ? err.name : typeof err}`);
      if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
    }
  }

  /** No server-initiated stream in v1. */
  @Get()
  get(@Res() res: Response): void {
    methodNotAllowed(res);
  }

  /** Stateless: there is no session to delete. */
  @Delete()
  remove(@Res() res: Response): void {
    methodNotAllowed(res);
  }
}

function methodNotAllowed(res: Response): void {
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: 'method_not_allowed' });
}

/**
 * Protocol negotiation: `initialize` answers with the client's version
 * when we support it, otherwise with our current one, and the client
 * decides whether to continue. The SDK's own list is wider than ours, so
 * an `initialize` that asks for a version outside `MCP_PROTOCOL_VERSIONS`
 * is handed to the SDK as a request for our current version.
 */
export function pinProtocolVersion(body: unknown): unknown {
  const pin = (msg: unknown): unknown => {
    if (typeof msg !== 'object' || msg === null) return msg;
    const m = msg as { method?: unknown; params?: unknown };
    if (m.method !== 'initialize' || typeof m.params !== 'object' || m.params === null) return msg;
    const params = m.params as { protocolVersion?: unknown };
    if (isSupportedMcpProtocolVersion(params.protocolVersion)) return msg;
    return { ...m, params: { ...params, protocolVersion: MCP_PROTOCOL_VERSIONS[0] } };
  };
  return Array.isArray(body) ? body.map(pin) : pin(body);
}
