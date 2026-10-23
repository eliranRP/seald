import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import type { McpTool } from '../mcp/tool';
import { PublicApiFailure } from './public-api-errors';
import type { PublicApiRoute } from './routes';

type JsonProps = Record<string, { type?: unknown } | undefined>;

const propsCache = new WeakMap<McpTool, JsonProps>();

/** The input properties of a tool as JSON Schema, for query-string coercion. */
function inputProps(tool: McpTool): JsonProps {
  const cached = propsCache.get(tool);
  if (cached) return cached;
  const json = z.toJSONSchema(tool.input, { target: 'draft-7', io: 'input' }) as {
    properties?: JsonProps;
  };
  const props = json.properties ?? {};
  propsCache.set(tool, props);
  return props;
}

/** A query string value as the type the tool input declares. */
function coerce(value: unknown, type: unknown): unknown {
  if (type === 'integer' || type === 'number') {
    return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
      ? Number(value)
      : value;
  }
  if (type === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }
  if (type === 'array') {
    if (Array.isArray(value)) return value;
    return typeof value === 'string' ? value.split(',').filter((s) => s.length > 0) : value;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The tool arguments for one request: JSON body, then query string, then
 * path parameters (a path parameter always wins). A write adds
 * `idempotency_key` from the `Idempotency-Key` header (or the body) and
 * `dry_run` (default false, or `?dry_run=true` on a DELETE).
 *
 * Without an `Idempotency-Key` the call still runs once: a random key is
 * generated, which cannot be replayed because no client knows it.
 */
export function buildToolArgs(
  route: PublicApiRoute,
  tool: McpTool,
  req: Pick<Request, 'body' | 'query' | 'params' | 'headers' | 'method'>,
): Record<string, unknown> {
  const props = inputProps(tool);
  const args: Record<string, unknown> = {};

  const hasBody = route.method !== 'GET' && route.method !== 'DELETE';
  if (hasBody && req.body !== undefined && !(isPlainObject(req.body) && isEmpty(req.body))) {
    if (!isPlainObject(req.body)) throw new PublicApiFailure('validation_error');
    Object.assign(args, req.body);
  }

  for (const [name, raw] of Object.entries(req.query)) {
    if (name === 'idempotency_key') continue;
    // Only keys the tool declares; anything else is left for the strict
    // schema to reject as `validation_error`.
    const declared = props[name];
    args[name] = declared ? coerce(raw, declared.type) : raw;
  }

  for (const [name, value] of Object.entries(req.params)) args[name] = value;

  if (tool.mutating) {
    const header = req.headers['idempotency-key'];
    const fromHeader = Array.isArray(header) ? header[0] : header;
    const key =
      fromHeader ??
      (typeof args['idempotency_key'] === 'string' ? args['idempotency_key'] : undefined);
    args['idempotency_key'] = key ?? `rest-${randomUUID()}`;
    if (args['dry_run'] === undefined) args['dry_run'] = false;
  } else {
    delete args['idempotency_key'];
    delete args['dry_run'];
  }
  return args;
}

function isEmpty(o: Record<string, unknown>): boolean {
  return Object.keys(o).length === 0;
}
