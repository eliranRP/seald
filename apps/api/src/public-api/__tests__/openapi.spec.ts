import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { z } from 'zod';
import { MCP_TOOLS } from '../../mcp/tools';
import type { McpTool } from '../../mcp/tool';
import { buildOpenApiDocument } from '../openapi';
import { PublicApiController, PublicApiDocsController } from '../public-api.controller';
import { openApiPath, pathParams, PUBLIC_API_ROUTES } from '../routes';

type Json = Record<string, unknown>;

const ALL_TOOLS = new Map<string, McpTool>(MCP_TOOLS.map((t) => [t.name, t]));
const doc = buildOpenApiDocument(PUBLIC_API_ROUTES, ALL_TOOLS) as {
  openapi: string;
  info: Json;
  paths: Record<string, Record<string, Json>>;
  components: { schemas: Record<string, Json>; responses: Record<string, Json> };
};

const METHODS = ['get', 'put', 'post', 'delete', 'patch'];
const JSON_TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];

/** Resolve `#/a/b/c` in the document, or null. */
function resolve(ref: string): unknown {
  if (!ref.startsWith('#/')) return null;
  let node: unknown = doc;
  for (const part of ref.slice(2).split('/')) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as Json)[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return node ?? null;
}

/** Every `$ref` resolves; every `type` is a JSON Schema type; no leftover `$defs`. */
function checkSchema(node: unknown, where: string, problems: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((n, i) => checkSchema(n, `${where}[${i}]`, problems));
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const obj = node as Json;
  if (typeof obj['$ref'] === 'string' && resolve(obj['$ref']) === null) {
    problems.push(`${where}: unresolved ${obj['$ref']}`);
  }
  if ('$defs' in obj) problems.push(`${where}: $defs left in place`);
  if ('$schema' in obj) problems.push(`${where}: $schema left in place`);
  const type = obj['type'];
  const types = Array.isArray(type) ? type : type === undefined ? [] : [type];
  for (const t of types) {
    if (typeof t !== 'string' || !JSON_TYPES.includes(t))
      problems.push(`${where}: type ${String(t)}`);
  }
  for (const [k, v] of Object.entries(obj)) checkSchema(v, `${where}.${k}`, problems);
}

/** The structural rules of OpenAPI 3.1 this document relies on. */
function validate(document: typeof doc): string[] {
  const problems: string[] = [];
  if (!/^3\.1\.\d+$/.test(document.openapi)) problems.push('openapi must be 3.1.x');
  if (typeof document.info['title'] !== 'string') problems.push('info.title');
  if (typeof document.info['version'] !== 'string') problems.push('info.version');
  const ids = new Set<string>();
  for (const [path, item] of Object.entries(document.paths)) {
    if (!path.startsWith('/')) problems.push(`${path}: must start with /`);
    const declaredInPath = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string);
    for (const [method, raw] of Object.entries(item)) {
      const where = `${method.toUpperCase()} ${path}`;
      if (!METHODS.includes(method)) problems.push(`${where}: unknown method`);
      const op = raw as {
        operationId?: string;
        parameters?: Array<{ name: string; in: string; required?: boolean; schema?: Json }>;
        responses?: Record<string, Json>;
        requestBody?: { content?: Record<string, { schema?: Json }> };
      };
      if (!op.operationId) problems.push(`${where}: operationId`);
      else if (ids.has(op.operationId)) problems.push(`${where}: duplicate operationId`);
      else ids.add(op.operationId);
      if (!op.responses || Object.keys(op.responses).length === 0)
        problems.push(`${where}: responses`);
      const seen = new Set<string>();
      for (const p of op.parameters ?? []) {
        const k = `${p.in}:${p.name}`;
        if (seen.has(k)) problems.push(`${where}: duplicate parameter ${k}`);
        seen.add(k);
        if (!['path', 'query', 'header'].includes(p.in)) problems.push(`${where}: parameter in`);
        if (p.in === 'path' && p.required !== true) problems.push(`${where}: path param optional`);
        if (!p.schema) problems.push(`${where}: parameter ${p.name} has no schema`);
      }
      const pathParamNames = (op.parameters ?? [])
        .filter((p) => p.in === 'path')
        .map((p) => p.name);
      if ([...declaredInPath].sort().join() !== [...pathParamNames].sort().join()) {
        problems.push(
          `${where}: path params ${declaredInPath.join()} vs declared ${pathParamNames.join()}`,
        );
      }
      if ((method === 'get' || method === 'delete') && op.requestBody) {
        problems.push(`${where}: ${method} with a body`);
      }
      checkSchema(op, where, problems);
    }
  }
  for (const [name, schema] of Object.entries(document.components.schemas)) {
    checkSchema(schema, `components.schemas.${name}`, problems);
  }
  return problems;
}

/** `METHOD /api/v1/path` for every route Nest will register on the two controllers. */
function registeredRoutes(): string[] {
  const out: string[] = [];
  for (const ctrl of [PublicApiController, PublicApiDocsController]) {
    const base = Reflect.getMetadata(PATH_METADATA, ctrl) as string;
    for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
      const handler = (ctrl.prototype as unknown as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string;
      out.push(
        `${RequestMethod[method]} /${base}/${path}`
          .replace(/\/+/g, '/')
          .replace(/\/$/, '')
          .replace(/:([A-Za-z_]+)/g, '{$1}'),
      );
    }
  }
  return out;
}

describe('OpenAPI document of /api/v1', () => {
  it('is a valid OpenAPI 3.1 document', () => {
    expect(validate(doc)).toEqual([]);
  });

  it('lists every route the controllers register, and nothing else', () => {
    const documented = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.keys(item).map((m) => `${m.toUpperCase()} /api/v1${path}`),
    );
    expect(documented.sort()).toEqual(registeredRoutes().sort());
  });

  it('documents each table route once, with its tool, scopes and Idempotency-Key on writes', () => {
    for (const route of PUBLIC_API_ROUTES) {
      const op = doc.paths[openApiPath(route.path)]?.[route.method.toLowerCase()] as
        | (Json & { parameters: Array<{ name: string }> })
        | undefined;
      expect({ route: `${route.method} ${route.path}`, documented: op !== undefined }).toEqual({
        route: `${route.method} ${route.path}`,
        documented: true,
      });
      const tool = ALL_TOOLS.get(route.tool);
      expect(tool).toBeDefined();
      expect(op?.['x-seald-mcp-tool']).toBe(route.tool);
      expect(op?.['x-seald-scopes']).toEqual([...(tool?.scopes ?? [])]);
      const hasKey = op?.parameters.some((p) => p.name === 'Idempotency-Key') ?? false;
      expect(hasKey).toBe(tool?.mutating === true);
    }
  });

  it('every route names a tool that exists, and a path parameter that tool takes', () => {
    for (const route of PUBLIC_API_ROUTES) {
      const tool = ALL_TOOLS.get(route.tool);
      expect(tool).toBeDefined();
      const props = Object.keys(
        (z.toJSONSchema(tool?.input as z.ZodType, { io: 'input' }) as { properties?: Json })
          .properties ?? {},
      );
      for (const p of pathParams(route.path)) expect(props).toContain(p);
    }
  });

  it('has no duplicate method and path', () => {
    const keys = PUBLIC_API_ROUTES.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('puts a static path before the :param path that would swallow it', () => {
    PUBLIC_API_ROUTES.forEach((route, i) => {
      const swallowers = PUBLIC_API_ROUTES.slice(0, i)
        .filter((r) => r.method === route.method && r.path !== route.path)
        .filter((r) => new RegExp(`^${r.path.replace(/:[A-Za-z_]+/g, '[^/]+')}$`).test(route.path));
      expect({ route: route.path, swallowers: swallowers.map((r) => r.path) }).toEqual({
        route: route.path,
        swallowers: [],
      });
    });
  });

  it('documents the 202 approval_pending answer on send, remind and cancel only', () => {
    const withAccepted = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([, op]) => '202' in ((op['responses'] as Json) ?? {}))
        .map(([m]) => `${m.toUpperCase()} ${path}`),
    );
    expect(withAccepted.sort()).toEqual(
      [
        'POST /envelopes/{envelope_id}/send',
        'POST /envelopes/{envelope_id}/cancel',
        'POST /envelopes/{envelope_id}/signers/{signer_id}/remind',
      ].sort(),
    );
  });

  it('leaves the key out of the body and keeps the owner out of every schema', () => {
    const serialized = JSON.stringify(doc);
    expect(serialized).not.toContain('owner_id');
    const create = doc.paths['/envelopes']?.['post'] as {
      requestBody: {
        content: { 'application/json': { schema: { properties: Json; required?: string[] } } };
      };
    };
    const schema = create.requestBody.content['application/json'].schema;
    expect(Object.keys(schema.properties)).toContain('title');
    expect(Object.keys(schema.properties)).not.toContain('idempotency_key');
    expect(schema.required ?? []).not.toContain('dry_run');
  });

  it('drops a route whose tool is not served (a flag off)', () => {
    const without = new Map(ALL_TOOLS);
    without.delete('envelopes_add_document');
    const partial = buildOpenApiDocument(PUBLIC_API_ROUTES, without) as typeof doc;
    expect(partial.paths['/envelopes/{envelope_id}/documents']?.['post']).toBeUndefined();
    expect(partial.paths['/envelopes/{envelope_id}/documents']?.['get']).toBeDefined();
  });
});
