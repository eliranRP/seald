import { RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { FEATURE_FLAGS, type FeatureFlag } from 'shared';
import { AppModule } from '../app.module';
import { JWKS_RESOLVER } from '../auth/jwks.provider';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import {
  EXCLUSION_REASONS,
  ROUTE_COVERAGE,
  SHIPPED_STEPS,
  type RouteCoverage,
} from './route-coverage';
import { listTools } from './tool-catalog';

/**
 * Parity contract (docs/design/mcp-server.md § Parity; parity plan D5).
 * Boots the Nest app, enumerates every sender route (a controller route
 * the Supabase AuthGuard protects), and fails when:
 *
 * - a sender route is missing from `ROUTE_COVERAGE`;
 * - a registry entry names no route (stale);
 * - a `tool` is absent from tools/list with every flag on;
 * - a `planned` step has already shipped, or is not `step-N` / `WP-45`;
 * - an `excluded` reason is outside the D5 list.
 *
 * `@Public()` routes (signer links, verify, cron, health, OAuth callback,
 * `/mcp`) are skipped by that decorator, not by a hand-kept list.
 */
const TEST_ENV: AppEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGIN: 'http://localhost:5173',
  APP_PUBLIC_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db?sslmode=disable',
  STORAGE_BUCKET: 'envelopes',
  TC_VERSION: 'tc',
  PRIVACY_VERSION: 'pp',
  EMAIL_PROVIDER: 'logging',
  EMAIL_FROM_ADDRESS: 'onboarding@resend.dev',
  EMAIL_FROM_NAME: 'Seald',
  EMAIL_LEGAL_ENTITY: 'Seald',
  EMAIL_LEGAL_POSTAL: 'Postal address',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  WORKER_ENABLED: false,
  GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
  GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
};

interface Route {
  readonly key: string;
  readonly isPublic: boolean;
}

const VERBS: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
};

function joinPath(...parts: string[]): string {
  const joined = parts
    .flatMap((p) => p.split('/'))
    .filter((s) => s.length > 0)
    .join('/');
  return `/${joined}`;
}

function enumerateRoutes(moduleRef: TestingModule): Route[] {
  const routes = new Map<string, Route>();
  for (const mod of moduleRef.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const ctrl = wrapper.metatype as Type<unknown> | null;
      if (!ctrl) continue;
      const basePaths = [Reflect.getMetadata(PATH_METADATA, ctrl) ?? ''].flat() as string[];
      const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, ctrl) === true;
      const proto = ctrl.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        const verb = method === undefined ? undefined : VERBS[method];
        if (!verb) continue;
        const paths = [Reflect.getMetadata(PATH_METADATA, handler) ?? '/'].flat() as string[];
        const isPublic = classPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true;
        for (const base of basePaths) {
          for (const path of paths) {
            const key = `${verb} ${joinPath(base, path)}`;
            routes.set(key, { key, isPublic });
          }
        }
      }
    }
  }
  return [...routes.values()];
}

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

describe('MCP route coverage (contract)', () => {
  let routes: Route[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(() => Promise.reject(new Error('no jwks in this spec')))
      .compile();
    routes = enumerateRoutes(moduleRef);
    await moduleRef.close();
  }, 60_000);

  const senderRoutes = () => routes.filter((r) => !r.isPublic).map((r) => r.key);

  it('found the app routes, including /mcp as a public route', () => {
    expect(routes.length).toBeGreaterThan(40);
    expect(routes).toContainEqual({ key: 'POST /mcp', isPublic: true });
    expect(routes).toContainEqual({ key: 'POST /sign/submit', isPublic: true });
  });

  it('maps every sender route', () => {
    const missing = senderRoutes().filter((key) => !(key in ROUTE_COVERAGE));
    expect(missing).toEqual([]);
  });

  it('has no stale entries, and lists no @Public() route', () => {
    const sender = new Set(senderRoutes());
    const stale = Object.keys(ROUTE_COVERAGE).filter((key) => !sender.has(key));
    expect(stale).toEqual([]);
  });

  it('names only tools that tools/list serves with every flag on', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = Object.fromEntries(
      Object.keys(FEATURE_FLAGS).map((k) => [k, true]),
    ) as Record<FeatureFlag, boolean>;
    try {
      const served = new Set(listTools().map((t) => t.name));
      const entries = Object.entries(ROUTE_COVERAGE) as Array<[string, RouteCoverage]>;
      for (const [key, cov] of entries) {
        if ('tool' in cov)
          expect({ key, served: served.has(cov.tool) }).toEqual({ key, served: true });
      }
    } finally {
      delete host.__SEALD_FEATURE_OVERRIDES__;
    }
  });

  it('plans only unshipped steps or WP-45', () => {
    for (const [key, cov] of Object.entries(ROUTE_COVERAGE)) {
      if (!('planned' in cov)) continue;
      expect({ key, planned: cov.planned }).toEqual({
        key,
        planned: expect.stringMatching(/^(step-\d+[a-z]?|WP-45)$/),
      });
      expect(SHIPPED_STEPS as readonly string[]).not.toContain(cov.planned);
    }
  });

  it('excludes only signer-link, verify, cron, OAuth browser or owner-decision routes, each with a note', () => {
    for (const [key, cov] of Object.entries(ROUTE_COVERAGE)) {
      if (!('excluded' in cov)) continue;
      expect(EXCLUSION_REASONS).toContain(cov.excluded);
      expect(cov.note.length).toBeGreaterThan(10);
      // The owner-decision exclusion covers the approval routes only.
      if (cov.excluded === 'owner_approval_decision') {
        expect(key).toMatch(/^POST \/approvals\/:id\/(approve|deny|refresh)$/);
      }
    }
  });

  it('gives require_owner_approval no tool, and no tool decides an approval', () => {
    for (const tool of listTools()) {
      expect(tool.name).not.toMatch(
        /require_owner_approval|approvals_(approve|deny|decide|refresh)/,
      );
      if (/approval/.test(tool.name))
        expect(['approvals_get', 'approvals_list']).toContain(tool.name);
    }
  });
});
