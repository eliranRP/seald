import 'reflect-metadata';
import type { NextFunction, Request, Response } from 'express';
import { createConfiguredApp } from './app-setup';

/**
 * Supabase Edge Function entry (AWS exit plan, WS-0).
 *
 * The edge runtime routes `https://<ref>.supabase.co/functions/v1/<name>/*`
 * to this worker with the path still prefixed by `/<name>`. Strip it so the
 * Nest routes match exactly as they do behind Caddy. The runtime proxies
 * requests to whatever node:http server the worker listens on.
 */
const EDGE_PORT = 8000;

export async function bootstrapEdge(functionName: string): Promise<void> {
  // Nest's default on a boot error is process.abort(), which the edge
  // runtime ignores, leaving a half-built app. Throw instead so the worker
  // fails visibly and the gateway reports it.
  const { app } = await createConfiguredApp({ abortOnError: false });
  const prefix = `/${functionName}`;
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.url === prefix) req.url = '/';
    else if (req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`)) {
      req.url = req.url.slice(prefix.length);
    }
    next();
  });
  await app.listen(EDGE_PORT);
}
