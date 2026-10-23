import { z } from 'zod';
import { isAllowedRedirectUri } from './redirect-uri';

/** One pre-registered public client (`MCP_OAUTH_CLIENTS`). */
export interface PreregisteredClient {
  readonly clientId: string;
  readonly clientName: string;
  readonly redirectUris: readonly string[];
}

const PreregisteredClientSchema = z
  .object({
    client_id: z.string().trim().min(1).max(2048),
    client_name: z.string().trim().min(1).max(200),
    redirect_uris: z
      .array(z.string().max(2048).refine(isAllowedRedirectUri, 'https or loopback only'))
      .min(1)
      .max(20),
  })
  .strict();

/**
 * Parses `MCP_OAUTH_CLIENTS`: a JSON array of
 * `{ client_id, client_name, redirect_uris }`. Unset or empty means no
 * pre-registered client. Throws on anything malformed, so startup fails
 * (env.schema) instead of serving a half-read allow-list.
 */
export function parsePreregisteredClients(raw: string | undefined): PreregisteredClient[] {
  if (raw === undefined || raw.trim() === '') return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('MCP_OAUTH_CLIENTS must be a JSON array');
  }
  const parsed = z.array(PreregisteredClientSchema).max(50).safeParse(json);
  if (!parsed.success) throw new Error(`MCP_OAUTH_CLIENTS is invalid: ${parsed.error.message}`);
  const seen = new Set<string>();
  return parsed.data.map((c) => {
    if (seen.has(c.client_id)) throw new Error(`MCP_OAUTH_CLIENTS repeats ${c.client_id}`);
    seen.add(c.client_id);
    return { clientId: c.client_id, clientName: c.client_name, redirectUris: c.redirect_uris };
  });
}

/** CSV of hostnames; CIMD clients served from them are not labelled unverified. */
export function parseVerifiedCimdHosts(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
}
