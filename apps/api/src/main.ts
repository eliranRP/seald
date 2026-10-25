import 'reflect-metadata';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { createConfiguredApp } from './app-setup';

/** HTTP keep-alive must be shorter than headers timeout (Node ≥18.5 invariant). */
const KEEP_ALIVE_TIMEOUT_MS = 5_000;
const HEADERS_TIMEOUT_MS = 6_000;
const REQUEST_TIMEOUT_MS = 30_000;

function loadDotenv(): void {
  // Populate process.env from apps/api/.env for local dev.
  // In production the host (e.g. Vercel, Docker) injects env vars directly.
  //
  // Resolve relative to the package root, not __dirname: the compiled entry
  // lives at `apps/api/dist/src/main.js`, so `__dirname`-based lookup would
  // land in `apps/api/dist/.env` (wrong). `process.cwd()` is always the API
  // package when launched via `pnpm --filter api start:dev`.
  try {
    process.loadEnvFile(resolve(process.cwd(), '.env'));
  } catch {
    // No .env file present — fall through and let zod validate whatever is in process.env.
  }
}

/**
 * Process-wide safety net (rule 2.5). Floating rejections + uncaught exceptions
 * are programmer errors — log and exit non-zero so the supervisor restarts. Never
 * silently swallow.
 */
function installCrashHandlers(logger: Logger): void {
  process.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({ reason }, 'unhandledRejection');
    // Re-throw so the default uncaughtException path runs and the process exits.
    throw reason;
  });
  process.on('uncaughtException', (err: Error) => {
    logger.fatal({ err }, 'uncaughtException');
    process.exit(1);
  });
}

async function bootstrap() {
  loadDotenv();
  const { app, env } = await createConfiguredApp();
  const logger = new Logger('bootstrap');

  installCrashHandlers(logger);

  // SIGTERM (orchestrator stop) + SIGINT (Ctrl-C) → graceful shutdown via
  // OnApplicationShutdown lifecycle hooks (rule 12.1, 12.4). DbModule already
  // disconnects Kysely; worker services already drain their loops.
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  // Slowloris + LB-race protections (rule 6.10, 12.2). Defaults are too generous
  // for a public-internet API; set explicitly so the deploy contract is obvious.
  // Use the http adapter's server (typed as the Node http.Server) rather than
  // app.listen()'s return value (typed as `any` in Nest 10).
  const server = app.getHttpServer() as import('node:http').Server;
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;
}

void bootstrap();
