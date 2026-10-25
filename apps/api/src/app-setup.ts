import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { securityHeaders } from './security-headers';
import { APP_ENV } from './config/config.module';
import type { AppEnv } from './config/env.schema';

/**
 * Builds the Nest app with every middleware, pipe and CORS rule applied, but
 * does not listen. Shared by the Docker entry (`main.ts`) and the Supabase
 * Edge Function entry (`edge-main.ts`) so both serve identical behavior.
 */
export async function createConfiguredApp(
  options: { abortOnError?: boolean } = {},
): Promise<{ app: INestApplication; env: AppEnv }> {
  const app = await NestFactory.create(AppModule, { rawBody: true, ...options });
  const env = app.get<AppEnv>(APP_ENV);

  // Trust the first proxy hop (Caddy, or the Cloudflare proxy in front of
  // the edge function) so X-Forwarded-For is honored by Express. The
  // `extractClientIp` helper relies on it for IP attribution in the audit trail.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // CORS allow-list: env.CORS_ORIGIN is a comma-separated list. Origin-less
  // requests (server-to-server, curl, mobile) are allowed; browser origins
  // must match exactly. Anything else gets rejected with a clear error.
  const allowed = env.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true); // server-to-server, curl, Postman
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not in allowlist`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // MCP (WP-17): browser hosts such as the MCP Inspector send the
    // protocol version header on every POST to /mcp.
    allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Protocol-Version', 'Last-Event-ID'],
    // WP-11: the SPA is on another origin, and the access-code countdown
    // reads Retry-After from 429s.
    exposedHeaders: ['Retry-After'],
    maxAge: 600,
  });

  // Security headers — see security-headers.ts for the rationale on
  // disabling Cross-Origin-Opener-Policy (Bug I).
  app.use(securityHeaders());

  // JSON / urlencoded body limits — file uploads use FileInterceptor with
  // their own multer limits, so 1mb here just bounds JSON payloads.
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: false, limit: '1mb' }));

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // HttpExceptionFilter is registered via APP_FILTER in AppModule (rule 6.2)
  // so it can inject Logger / ConfigService cleanly.

  return { app, env };
}
