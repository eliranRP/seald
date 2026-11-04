import type { IncomingHttpHeaders } from 'node:http';

/**
 * Supabase Edge (Deno's node:http) can hand Express an IncomingMessage whose
 * `rawHeaders` is not an array. The MCP SDK converts the Node request to a
 * web Request through @hono/node-server, which calls `rawHeaders.slice()`,
 * so every authenticated `POST /mcp` failed with a 400 "Parse error"
 * (`rawHeaders.slice is not a function`) and clients then tried GET (405).
 *
 * Rebuild Node's flat `[name, value, name, value, ...]` list from
 * `req.headers` when it is missing or not an array. No-op on Node.
 */
export function normalizeRawHeaders(req: {
  rawHeaders?: unknown;
  headers: IncomingHttpHeaders;
}): void {
  if (Array.isArray(req.rawHeaders)) return;
  const flat: string[] = [];
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) flat.push(name, String(v));
  }
  Object.defineProperty(req, 'rawHeaders', {
    value: flat,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}
