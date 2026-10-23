import {
  Controller,
  Get,
  Logger,
  Req,
  RequestMethod,
  Res,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Throttle } from '@nestjs/throttler';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { availableTools, findTool } from '../mcp/tool-catalog';
import { McpToolRunner } from '../mcp/tool-runner';
import { MCP_TOOLS } from '../mcp/tools';
import type { McpTool } from '../mcp/tool';
import { ApiKeyGuard, PUBLIC_API_PRINCIPAL, type PublicApiRequest } from './api-key.guard';
import { buildOpenApiDocument } from './openapi';
import {
  PublicApiExceptionFilter,
  PublicApiFailure,
  errorBody,
  statusForSlug,
} from './public-api-errors';
import { PublicApiFlagGuard } from './public-api-flag';
import { PublicApiRateGuard } from './public-api-rate-limiter';
import { buildToolArgs } from './request-args';
import { PUBLIC_API_ROUTES, type PublicApiRoute } from './routes';

/**
 * Public REST API v1 (parity plan WP-35, decision D1): `/api/v1/*`, thin
 * adapters over the MCP tools, which are themselves thin adapters over
 * the application services the app calls. There is no business logic
 * here. One route table (`routes.ts`) names the tool each route calls;
 * `McpToolRunner` checks scopes, validates the input, runs the dry run,
 * claims the idempotency key (atomically for send, remind and cancel) and
 * returns the result, so REST and MCP cannot drift apart.
 *
 * `send`, `remind` and `cancel` answer `202 { status: 'approval_pending',
 * approval_id, ... }` through the WP-21/WP-24 approval path, or act at
 * once only on the unattended path WP-24 defined for a key whose owner
 * turned per-send approval off (confirmation token, caps and suspension
 * unchanged).
 *
 * `@Public()` opts out of the Supabase-only global AuthGuard;
 * `ApiKeyGuard` is the credential check. `PublicApiFlagGuard` runs first,
 * so a dark surface is a 404 before auth. The `/mcp` buckets apply, plus
 * 30 requests per minute per key.
 */
@Public()
@Controller('api/v1')
@UseFilters(PublicApiExceptionFilter)
@UseGuards(PublicApiFlagGuard, ApiKeyGuard, PublicApiRateGuard)
@Throttle({
  short: { limit: 10, ttl: 1000 },
  medium: { limit: 30, ttl: 60_000 },
  long: { limit: 300, ttl: 3_600_000 },
})
export class PublicApiController {
  private readonly log = new Logger('PublicApi');

  constructor(private readonly runner: McpToolRunner) {}

  /** Runs one route of `PUBLIC_API_ROUTES`. */
  async execute(route: PublicApiRoute, req: PublicApiRequest, res: Response): Promise<void> {
    const principal = req[PUBLIC_API_PRINCIPAL];
    if (!principal) throw new UnauthorizedException('missing_token');
    res.setHeader('Cache-Control', 'no-store');

    const tool = findTool(route.tool);
    if (!tool) {
      // The tool's flag is off (multi-document, signing order): no such route.
      this.send(res, 404, errorBody('not_found'));
      return;
    }

    let result: CallToolResult;
    try {
      result = await this.runner.call(tool.name, buildToolArgs(route, tool, req), principal);
    } catch (err) {
      if (err instanceof PublicApiFailure) throw err;
      // The runner logged the tool, key and reason; nothing else leaves here.
      this.log.error(
        `route=${route.method} ${route.path} slug=internal_error type=${err instanceof Error ? err.name : typeof err}`,
      );
      this.send(res, 500, errorBody('internal_error'));
      return;
    }

    if (result.isError) {
      const failure = readFailure(result);
      if (failure.retry_after_seconds !== undefined) {
        res.setHeader('Retry-After', String(failure.retry_after_seconds));
      }
      this.send(res, statusForSlug(failure.slug), errorBody(failure.slug, failure));
      return;
    }

    const body = (result.structuredContent ?? {}) as Record<string, unknown>;
    if (body['status'] === 'approval_pending') {
      this.send(res, 202, body);
      return;
    }
    this.send(
      res,
      route.success ?? 200,
      route.pick ? { [route.pick]: body[route.pick] ?? [] } : body,
    );
  }

  private send(res: Response, status: number, body: unknown): void {
    res.status(status).json(body);
  }
}

function readFailure(result: CallToolResult): {
  slug: string;
  retry_after_seconds?: number;
  url?: string;
} {
  const first = result.content[0];
  let parsed: unknown;
  try {
    parsed = JSON.parse(first && first.type === 'text' ? first.text : '{}');
  } catch {
    parsed = {};
  }
  const o = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as {
    slug?: unknown;
    retry_after_seconds?: unknown;
    url?: unknown;
  };
  return {
    slug: typeof o.slug === 'string' ? o.slug : 'internal_error',
    ...(typeof o.retry_after_seconds === 'number'
      ? { retry_after_seconds: o.retry_after_seconds }
      : {}),
    ...(typeof o.url === 'string' ? { url: o.url } : {}),
  };
}

/**
 * Register one Nest route per table entry. The decorators a hand-written
 * method would carry are applied here, so the route shows up in the router
 * and in the route-coverage enumeration (class `@Public()`) like any other.
 * Table order is route order: a static path precedes the `:param` path it
 * would otherwise be swallowed by.
 */
PUBLIC_API_ROUTES.forEach((route, index) => {
  const name = `route_${index}`;
  const handler = async function (
    this: PublicApiController,
    req: PublicApiRequest,
    res: Response,
  ): Promise<void> {
    await this.execute(route, req, res);
  };
  Object.defineProperty(PublicApiController.prototype, name, {
    value: handler,
    writable: true,
    configurable: true,
  });
  Reflect.defineMetadata(PATH_METADATA, route.path, handler);
  Reflect.defineMetadata(METHOD_METADATA, RequestMethod[route.method], handler);
  Req()(PublicApiController.prototype, name, 0);
  Res()(PublicApiController.prototype, name, 1);
});

/**
 * `GET /api/v1/openapi.json`: public (no key), dark with the flag. A
 * separate controller so the key guard does not apply.
 */
@Public()
@Controller('api/v1')
@UseFilters(PublicApiExceptionFilter)
@UseGuards(PublicApiFlagGuard)
@Throttle({
  short: { limit: 10, ttl: 1000 },
  medium: { limit: 30, ttl: 60_000 },
  long: { limit: 300, ttl: 3_600_000 },
})
export class PublicApiDocsController {
  private cache: { signature: string; doc: Record<string, unknown> } | null = null;

  @Get('openapi.json')
  openapi(@Res() res: Response): void {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(this.document());
  }

  /** Rebuilt only when the set of served tools changes (a flag flipped). */
  private document(): Record<string, unknown> {
    const tools = availableTools(MCP_TOOLS);
    const signature = tools.map((t) => t.name).join(',');
    if (this.cache?.signature !== signature) {
      const byName = new Map<string, McpTool>(tools.map((t) => [t.name, t]));
      this.cache = { signature, doc: buildOpenApiDocument(PUBLIC_API_ROUTES, byName) };
    }
    return this.cache.doc;
  }
}
