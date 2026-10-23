import {
  HttpException,
  Logger,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { z } from 'zod';
import { MCP_TOOLS } from '../../mcp/tools';
import type { McpTool } from '../../mcp/tool';
import {
  PublicApiExceptionFilter,
  PublicApiFailure,
  errorBody,
  messageForSlug,
  statusForSlug,
} from '../public-api-errors';
import { PUBLIC_API_PRINCIPAL } from '../api-key.guard';
import { PublicApiRateGuard, PublicApiRateLimiter } from '../public-api-rate-limiter';
import { buildToolArgs } from '../request-args';
import { PUBLIC_API_ROUTES, type PublicApiRoute } from '../routes';

const tool = (name: string): McpTool => {
  const t = MCP_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};
const route = (method: string, path: string): PublicApiRoute => {
  const r = PUBLIC_API_ROUTES.find((x) => x.method === method && x.path === path);
  if (!r) throw new Error(`no route ${method} ${path}`);
  return r;
};

describe('PublicApiRateLimiter', () => {
  it('lets 30 calls through per key per window, then says how long to wait', () => {
    let now = 1_000_000;
    const limiter = new PublicApiRateLimiter({ capacity: 3, windowMs: 60_000, clock: () => now });
    expect([1, 2, 3].map(() => limiter.take('k1'))).toEqual([null, null, null]);
    expect(limiter.take('k1')).toBe(60);
    now += 30_000;
    expect(limiter.take('k1')).toBe(30);
    // Another key has its own budget.
    expect(limiter.take('k2')).toBeNull();
    now += 30_000;
    expect(limiter.take('k1')).toBeNull();
  });

  it('defaults to the MCP numbers: 30 per 60 seconds', () => {
    const limiter = new PublicApiRateLimiter();
    const results = Array.from({ length: 31 }, () => limiter.take('k'));
    expect(results.slice(0, 30).every((r) => r === null)).toBe(true);
    expect(results[30]).toBeGreaterThan(0);
  });

  it('the guard spends no budget for an unauthenticated request', () => {
    const limiter = new PublicApiRateLimiter({ capacity: 1, windowMs: 60_000 });
    const guard = new PublicApiRateGuard(limiter);
    const ctx = (principal?: { keyId: string }) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ [PUBLIC_API_PRINCIPAL]: principal }),
          getResponse: () => ({ setHeader: () => undefined }),
        }),
      }) as unknown as ExecutionContext;
    expect(guard.canActivate(ctx())).toBe(true);
    expect(guard.canActivate(ctx())).toBe(true);
    expect(guard.canActivate(ctx({ keyId: 'k' }))).toBe(true);
    expect(() => guard.canActivate(ctx({ keyId: 'k' }))).toThrow(HttpException);
  });
});

describe('error slugs', () => {
  it('maps the slugs the tools return to stable statuses', () => {
    expect(statusForSlug('insufficient_scope')).toBe(403);
    expect(statusForSlug('envelope_not_found')).toBe(404);
    expect(statusForSlug('contact_not_found')).toBe(404);
    expect(statusForSlug('validation_error')).toBe(400);
    expect(statusForSlug('idempotency_conflict')).toBe(409);
    expect(statusForSlug('envelope_not_draft')).toBe(409);
    expect(statusForSlug('send_daily_cap')).toBe(429);
    expect(statusForSlug('file_required')).toBe(422);
    expect(statusForSlug('never_heard_of_it')).toBe(400);
  });

  it('every body is { error, message } with a fixed sentence, plus retry fields when given', () => {
    expect(errorBody('envelope_not_found')).toEqual({
      error: 'envelope_not_found',
      message: messageForSlug('envelope_not_found'),
    });
    expect(errorBody('remind_throttled', { retry_after_seconds: 30 })).toMatchObject({
      error: 'remind_throttled',
      retry_after_seconds: 30,
    });
    expect(messageForSlug('missing_token')).toMatch(/Bearer/);
  });

  it('the filter answers guard and unknown errors in the same shape', () => {
    const calls: Array<{ status: number; body: unknown; headers: Record<string, string> }> = [];
    const res = {
      headers: {} as Record<string, string>,
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      status(code: number) {
        return {
          json: (body: unknown) => calls.push({ status: code, body, headers: this.headers }),
        };
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({ method: 'GET', path: '/x' }),
      }),
    } as never;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const filter = new PublicApiExceptionFilter();
    filter.catch(new UnauthorizedException('missing_token'), host);
    filter.catch(new PublicApiFailure('validation_error'), host);
    filter.catch(new HttpException('ThrottlerException: Too Many Requests', 429), host);
    filter.catch(new Error('database password is hunter2'), host);
    expect(calls.map((c) => [c.status, (c.body as { error: string }).error])).toEqual([
      [401, 'missing_token'],
      [400, 'validation_error'],
      [429, 'rate_limited'],
      [500, 'internal_error'],
    ]);
    expect(JSON.stringify(calls)).not.toContain('hunter2');
    expect(res.headers['WWW-Authenticate']).toBe('Bearer');
  });
});

describe('buildToolArgs', () => {
  const req = (over: Partial<Parameters<typeof buildToolArgs>[2]> = {}) =>
    ({
      body: undefined,
      query: {},
      params: {},
      headers: {},
      method: 'POST',
      ...over,
    }) as Parameters<typeof buildToolArgs>[2];

  it('a write gets the Idempotency-Key header, a false dry_run and the path parameter', () => {
    const r = route('POST', '/envelopes/:envelope_id/send');
    const args = buildToolArgs(
      r,
      tool(r.tool),
      req({ params: { envelope_id: 'e1' }, headers: { 'idempotency-key': 'abcdefgh1' } }),
    );
    expect(args).toEqual({ envelope_id: 'e1', idempotency_key: 'abcdefgh1', dry_run: false });
  });

  it('without a header a random key is made, so the call runs once and cannot be replayed', () => {
    const r = route('POST', '/envelopes');
    const a = buildToolArgs(r, tool(r.tool), req({ body: { title: 'x' } }));
    const b = buildToolArgs(r, tool(r.tool), req({ body: { title: 'x' } }));
    expect(a['idempotency_key']).toMatch(/^rest-/);
    expect(a['idempotency_key']).not.toBe(b['idempotency_key']);
    expect(tool(r.tool).input.safeParse(a).success).toBe(true);
  });

  it('a path parameter beats a body key of the same name', () => {
    const r = route('PATCH', '/envelopes/:envelope_id');
    const args = buildToolArgs(
      r,
      tool(r.tool),
      req({
        method: 'PATCH',
        body: { envelope_id: 'evil', title: 't' },
        params: { envelope_id: 'real' },
      }),
    );
    expect(args['envelope_id']).toBe('real');
  });

  it('coerces query values to the types the tool declares and leaves unknown keys for the schema to reject', () => {
    const r = route('GET', '/contacts');
    const args = buildToolArgs(
      r,
      tool(r.tool),
      req({ method: 'GET', query: { limit: '5', bogus: '1' } }),
    );
    expect(args).toEqual({ limit: 5, bogus: '1' });
    expect(tool(r.tool).input.safeParse(args).success).toBe(false);
  });

  it('a read tool never gets idempotency_key or dry_run', () => {
    const r = route('GET', '/envelopes/:envelope_id/status');
    const args = buildToolArgs(
      r,
      tool(r.tool),
      req({
        method: 'GET',
        params: { envelope_id: 'e' },
        query: { dry_run: 'true', idempotency_key: 'zzzzzzzzz' },
      }),
    );
    expect(args).toEqual({ envelope_id: 'e' });
  });

  it('a DELETE takes ?dry_run=true', () => {
    const r = route('DELETE', '/envelopes/:envelope_id');
    const args = buildToolArgs(
      r,
      tool(r.tool),
      req({ method: 'DELETE', params: { envelope_id: 'e' }, query: { dry_run: 'true' } }),
    );
    expect(args['dry_run']).toBe(true);
  });

  it('a body that is not an object is a validation_error', () => {
    const r = route('POST', '/envelopes');
    expect(() => buildToolArgs(r, tool(r.tool), req({ body: ['x'] }))).toThrow(PublicApiFailure);
    expect(() => buildToolArgs(r, tool(r.tool), req({ body: 'x' }))).toThrow(PublicApiFailure);
  });

  it('every write route builds arguments its tool accepts', () => {
    for (const r of PUBLIC_API_ROUTES) {
      const t = tool(r.tool);
      if (!t.mutating) continue;
      const json = z.toJSONSchema(t.input, { io: 'input' }) as {
        properties?: Record<string, unknown>;
      };
      expect(json.properties).toHaveProperty('idempotency_key');
      expect(json.properties).toHaveProperty('dry_run');
    }
  });
});
