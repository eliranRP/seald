import { ApprovalPendingResultSchema } from 'shared';
import { z } from 'zod';
import type { McpTool } from '../mcp/tool';
import { openApiPath, pathParams, type PublicApiRoute } from './routes';

type Json = Record<string, unknown>;

/**
 * The OpenAPI 3.1 document of `/api/v1`, generated at request time from
 * the same Zod schemas the MCP tools validate with (`z.toJSONSchema`, JSON
 * Schema 2020-12, which OpenAPI 3.1 uses unchanged; no second schema
 * package). Request bodies are the tool input minus the path parameters
 * and `idempotency_key` (which travels in the `Idempotency-Key` header);
 * responses are the tool output.
 */
export const OPENAPI_VERSION = '3.1.0';
export const PUBLIC_API_VERSION = '1.0.0';

const ERROR_STATUSES = ['400', '401', '403', '404', '409', '429'] as const;
const APPROVAL_TOOLS = new Set(['envelopes_send', 'envelopes_remind', 'envelopes_cancel']);

const ErrorSchema: Json = {
  type: 'object',
  required: ['error', 'message'],
  properties: {
    error: { type: 'string', description: 'A stable slug, e.g. `envelope_not_found`.' },
    message: { type: 'string', description: 'A fixed sentence for the slug.' },
    retry_after_seconds: { type: 'integer', minimum: 1 },
    url: { type: 'string' },
  },
  additionalProperties: false,
};

function toSchema(type: z.ZodType, io: 'input' | 'output'): Json {
  const json = z.toJSONSchema(type, {
    target: 'draft-2020-12',
    io,
  }) as Json;
  delete json['$schema'];
  return json;
}

/** Hoist `$defs` into `components.schemas` and point every `$ref` at them. */
function hoist(schema: Json, prefix: string, components: Record<string, Json>): Json {
  const defs = (schema['$defs'] ?? {}) as Record<string, Json>;
  delete schema['$defs'];
  const rename = (name: string): string => `${prefix}_${name}`;
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (typeof node !== 'object' || node === null) return node;
    const out: Json = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string' && v.startsWith('#/$defs/')) {
        out[k] = `#/components/schemas/${rename(v.slice('#/$defs/'.length))}`;
      } else {
        out[k] = rewrite(v);
      }
    }
    return out;
  };
  for (const [name, def] of Object.entries(defs)) {
    components[rename(name)] = rewrite(def) as Json;
  }
  return rewrite(schema) as Json;
}

function bodySchema(tool: McpTool, route: PublicApiRoute): Json | null {
  const input = toSchema(tool.input, 'input');
  const props = { ...((input['properties'] ?? {}) as Record<string, Json>) };
  const required = new Set((input['required'] ?? []) as string[]);
  for (const name of pathParams(route.path)) {
    delete props[name];
    required.delete(name);
  }
  delete props['idempotency_key'];
  required.delete('idempotency_key');
  required.delete('dry_run');
  if (Object.keys(props).length === 0) return null;
  const { properties: _p, required: _r, ...rest } = input;
  return {
    ...rest,
    properties: props,
    ...(required.size > 0 ? { required: [...required] } : {}),
  };
}

function querySchemas(tool: McpTool, route: PublicApiRoute): Json[] {
  const input = toSchema(tool.input, 'input');
  const props = (input['properties'] ?? {}) as Record<string, Json>;
  const required = new Set((input['required'] ?? []) as string[]);
  const skip = new Set([...pathParams(route.path), 'idempotency_key']);
  const wanted = route.method === 'GET' || route.method === 'DELETE';
  return Object.entries(props)
    .filter(([name]) => wanted && !skip.has(name))
    .map(([name, schema]) => ({
      name,
      in: 'query',
      required: name !== 'dry_run' && required.has(name),
      schema,
    }));
}

export function buildOpenApiDocument(
  routes: readonly PublicApiRoute[],
  tools: ReadonlyMap<string, McpTool>,
): Json {
  const components: Record<string, Json> = {};
  const paths: Record<string, Record<string, Json>> = {};
  const tags = new Set<string>();
  const used = new Set<string>();

  for (const route of routes) {
    const tool = tools.get(route.tool);
    if (!tool) continue;
    tags.add(route.tag);
    const operationId = route.pick ? `${route.tool}_${route.pick}` : route.tool;
    if (used.has(operationId)) throw new Error(`duplicate operationId ${operationId}`);
    used.add(operationId);

    const parameters: Json[] = pathParams(route.path).map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    parameters.push(...querySchemas(tool, route));
    if (tool.mutating) {
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: false,
        description:
          'A client-chosen key of 8 to 200 characters. The same key with the same request within 24 hours returns the first result instead of running again.',
        schema: { type: 'string', minLength: 8, maxLength: 200 },
      });
    }

    const output = hoist(toSchema(tool.output, 'output'), operationId, components);
    const success = String(route.success ?? 200);
    const responses: Record<string, Json> = {
      [success]: {
        description: 'The result.',
        content: {
          'application/json': {
            schema: route.pick
              ? {
                  type: 'object',
                  required: [route.pick],
                  properties: {
                    [route.pick]:
                      ((output['properties'] ?? {}) as Record<string, Json>)[route.pick] ?? {},
                  },
                }
              : output,
          },
        },
      },
    };
    if (APPROVAL_TOOLS.has(route.tool)) {
      responses['202'] = {
        description:
          'Waiting for the account owner. Nothing has happened yet. Poll `GET /approvals/{approval_id}`; never open `review_url`.',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ApprovalPending' } },
        },
      };
    }
    for (const status of ERROR_STATUSES) {
      responses[status] = { $ref: `#/components/responses/Error${status}` };
    }

    const body =
      route.method === 'GET' || route.method === 'DELETE' ? null : bodySchema(tool, route);
    const operation: Json = {
      operationId,
      tags: [route.tag],
      summary: route.summary,
      parameters,
      ...(body
        ? { requestBody: { required: false, content: { 'application/json': { schema: body } } } }
        : {}),
      responses,
      security: [{ bearerAuth: [...tool.scopes] }],
      'x-seald-scopes': [...tool.scopes],
      'x-seald-mcp-tool': tool.name,
    };
    const item = (paths[openApiPath(route.path)] ??= {});
    item[route.method.toLowerCase()] = operation;
  }

  paths['/openapi.json'] = {
    get: {
      operationId: 'get_openapi_document',
      tags: ['Meta'],
      summary: 'This document',
      security: [],
      responses: {
        '200': {
          description: 'The OpenAPI 3.1 document.',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
      },
    },
  };
  tags.add('Meta');

  const approvalPending = hoist(
    toSchema(ApprovalPendingResultSchema, 'output'),
    'ApprovalPending',
    components,
  );
  const errorResponses = Object.fromEntries(
    ERROR_STATUSES.map((status) => [
      `Error${status}`,
      {
        description: 'An error. `error` is a stable slug.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    ]),
  );

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: 'Seald public API',
      version: PUBLIC_API_VERSION,
      description:
        'Prepare, send and track envelopes. Authenticate with an API key: `Authorization: Bearer seald_live_...`. Sending, reminding and canceling ask the account owner first: those calls answer 202 with `status: "approval_pending"` and nothing happens until the owner approves in Seald. Writes accept an `Idempotency-Key` header. Each key is limited to 30 requests per minute. Errors are `{ "error": slug, "message": text }`.',
    },
    servers: [{ url: '/api/v1' }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'An API key from Settings, Developers. The scopes of the key decide what it may call.',
        },
      },
      responses: errorResponses,
      schemas: {
        ...components,
        Error: ErrorSchema,
        ApprovalPending: approvalPending,
      },
    },
  };
}
