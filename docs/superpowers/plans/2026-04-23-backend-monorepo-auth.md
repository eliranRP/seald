# Backend Monorepo + Supabase Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo into a pnpm workspace monorepo (`apps/web`, `apps/api`, `packages/shared`) and ship a NestJS backend with provider-agnostic Supabase JWT validation, proven by a `GET /me` endpoint.

**Architecture:** Frontend moves intact into `apps/web/`. New `apps/api/` is a NestJS app. `packages/shared/` is a source-only TS package holding cross-app types. Auth uses Supabase's JWKS via `jose`'s `createRemoteJWKSet`, wrapped behind a DI-injected `JwksProvider` so tests use a local JWKS. `AuthGuard` is opt-in, `@CurrentUser()` surfaces `{ id, email, provider }` on `request.user`.

**Tech Stack:** pnpm workspaces, TypeScript, NestJS 10, Passport (custom strategy), `jose` for JWKS + JWT verify, `zod` for env validation, Jest + supertest for tests. Frontend stack unchanged.

**Source spec:** [docs/superpowers/specs/2026-04-23-backend-monorepo-auth-design.md](../specs/2026-04-23-backend-monorepo-auth-design.md).

---

## File Map

**Created (monorepo plumbing):**

- `pnpm-workspace.yaml` — workspace package globs.
- `tsconfig.base.json` — shared compiler options.
- `.nvmrc` — Node 20 (aligns with existing `engines`).

**Moved (frontend intact):**

- `src/**` → `apps/web/src/**`
- `.storybook/**` → `apps/web/.storybook/**`
- `index.html` → `apps/web/index.html`
- `vite.config.ts` → `apps/web/vite.config.ts`
- `tsconfig.json`, `tsconfig.node.json` → `apps/web/`
- `.eslintrc.cjs` → `apps/web/.eslintrc.cjs` (layer-rule target paths unchanged because they are relative to the config file location).
- `.eslintignore`, `.prettierignore` → `apps/web/` (root keeps its own for workspace-wide files).
- `dist/`, `storybook-static/` (build outputs) stay gitignored; not moved.

**Created (`packages/shared`):**

- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/index.ts` — barrel file.
- `packages/shared/src/signer.ts` — hosts `SIGNER_STATUSES`, `SignerStatus`, `Signer`, `SignatureValue`, `FIELD_KINDS`, `FieldKind`, `SIGNATURE_MODES`, `SignatureMode` (moved verbatim from `apps/web/src/types/sealdTypes.ts`).
- `apps/web/src/types/sealdTypes.ts` — replaced with a thin re-export from `shared`.

**Created (`apps/api`):**

- `apps/api/package.json`
- `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`
- `apps/api/nest-cli.json`
- `apps/api/.env.example`
- `apps/api/README.md`
- `apps/api/jest.config.ts`
- `apps/api/test/jest-e2e.json`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/env.schema.ts`
- `apps/api/src/config/config.module.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/auth-user.ts`
- `apps/api/src/auth/jwks.provider.ts`
- `apps/api/src/auth/supabase-jwt.strategy.ts`
- `apps/api/src/auth/auth.guard.ts`
- `apps/api/src/auth/current-user.decorator.ts`
- `apps/api/src/health/health.module.ts`
- `apps/api/src/health/health.controller.ts`
- `apps/api/src/common/filters/http-exception.filter.ts`
- Unit tests alongside each source file (`*.spec.ts`).
- `apps/api/test/auth.e2e-spec.ts`
- `apps/api/test/test-jwks.ts` — shared test helper for generating a local JWKS + signing test tokens.

**Modified (root):**

- `package.json` — drop app deps, keep workspace scripts + husky/lint-staged/prettier.
- `.gitignore` — add `apps/*/dist`, `apps/*/.env`, `apps/api/coverage`.
- `.husky/pre-commit` — ensure workspace-aware commands still run.
- `.lintstagedrc.json` — scope patterns to `apps/**`.

---

## Task Ordering

Tasks are ordered to keep the repo green at every commit:

1. Workspace scaffolding (repo still builds nothing yet).
2. Move frontend into `apps/web/` and verify all its tests/build still pass.
3. Create `packages/shared/` and migrate `Signer` types (proves workspace wiring).
4. Scaffold `apps/api/` skeleton + health endpoint (no auth yet).
5. Env validation.
6. JWKS provider + test helper.
7. Supabase JWT strategy.
8. AuthGuard + `@CurrentUser()` decorator.
9. `/me` endpoint.
10. E2E tests.
11. Root-level scripts, CI wiring, README.

---

## Task 1: Create pnpm workspace scaffolding

**Files:**

- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.nvmrc`

- [ ] **Step 1: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 2: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

- [ ] **Step 3: Write `.nvmrc`**

```
20
```

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml tsconfig.base.json .nvmrc
git commit -m "chore(repo): add pnpm workspace scaffolding"
```

---

## Task 2: Move frontend into `apps/web/`

**Files:**

- Move: `src/**` → `apps/web/src/**`
- Move: `.storybook/**` → `apps/web/.storybook/**`
- Move: `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `.eslintrc.cjs`, `.eslintignore`, `.prettierignore` → `apps/web/`
- Create: `apps/web/package.json` (from the existing root `package.json`, frontend parts only)
- Modify: root `package.json` (strip app deps, keep workspace scripts + tooling)

- [ ] **Step 1: Move files with `git mv`**

```bash
mkdir -p apps/web
git mv src apps/web/src
git mv .storybook apps/web/.storybook
git mv index.html apps/web/index.html
git mv vite.config.ts apps/web/vite.config.ts
git mv tsconfig.json apps/web/tsconfig.json
git mv tsconfig.node.json apps/web/tsconfig.node.json
git mv .eslintrc.cjs apps/web/.eslintrc.cjs
git mv .eslintignore apps/web/.eslintignore
git mv .prettierignore apps/web/.prettierignore
```

- [ ] **Step 2: Write `apps/web/package.json`**

Copy the existing root `package.json`, keep only fields the web app owns. `.history/` and `dist/` remain in gitignore at root.

```json
{
  "name": "web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json",
    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix",
    "test": "vitest run",
    "test:watch": "vitest",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  },
  "dependencies": {
    "lucide-react": "0.453.0",
    "pdfjs-dist": "^5.6.205",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "^7.14.2",
    "styled-components": "6.1.13"
  },
  "devDependencies": {
    "@storybook/addon-a11y": "8.3.5",
    "@storybook/addon-essentials": "8.3.5",
    "@storybook/addon-themes": "8.3.5",
    "@storybook/blocks": "8.3.5",
    "@storybook/react": "8.3.5",
    "@storybook/react-vite": "8.3.5",
    "@storybook/test": "8.3.5",
    "@testing-library/jest-dom": "6.5.0",
    "@testing-library/react": "16.0.1",
    "@testing-library/user-event": "14.5.2",
    "@types/node": "20.16.10",
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "@typescript-eslint/eslint-plugin": "7.18.0",
    "@typescript-eslint/parser": "7.18.0",
    "@vitejs/plugin-react-swc": "3.7.0",
    "eslint": "8.57.1",
    "eslint-config-airbnb": "19.0.4",
    "eslint-config-airbnb-typescript": "18.0.0",
    "eslint-config-prettier": "9.1.0",
    "eslint-plugin-import": "2.31.0",
    "eslint-plugin-jsx-a11y": "6.10.0",
    "eslint-plugin-react": "7.37.1",
    "eslint-plugin-react-hooks": "4.6.2",
    "jsdom": "25.0.1",
    "storybook": "8.3.5",
    "typescript": "5.6.3",
    "vite": "5.4.8",
    "vitest": "2.1.2",
    "vitest-axe": "0.1.0"
  }
}
```

- [ ] **Step 3: Rewrite root `package.json`**

```json
{
  "name": "seald-monorepo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev:web": "pnpm --filter web dev",
    "dev:api": "pnpm --filter api start:dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "format": "prettier --write .",
    "prepare": "husky"
  },
  "devDependencies": {
    "husky": "9.1.6",
    "lint-staged": "15.2.10",
    "prettier": "3.3.3"
  }
}
```

- [ ] **Step 4: Update `.lintstagedrc.json`**

```json
{
  "apps/**/*.{ts,tsx}": ["prettier --write"],
  "apps/**/*.{json,md,css,html}": ["prettier --write"]
}
```

- [ ] **Step 5: Update root `.gitignore`**

Append:

```
apps/*/dist
apps/*/coverage
apps/*/.env
apps/*/.env.local
```

- [ ] **Step 6: Install and verify web still works**

```bash
pnpm install
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

Expected: all four commands exit 0. If any fail, fix the path/config issue before committing. Common issues: ESLint `tsconfigRootDir: __dirname` — the path is relative to the config file which is now at `apps/web/.eslintrc.cjs`, so it continues to work. Storybook `.storybook/main.ts` — already relative.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore(repo): move frontend into apps/web workspace"
```

---

## Task 3: Create `packages/shared` and migrate Signer types

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/signer.ts`
- Modify: `apps/web/src/types/sealdTypes.ts` (replace with re-export)
- Modify: `apps/web/package.json` (add `"shared": "workspace:*"` dependency)

- [ ] **Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "echo 'no lint in shared'",
    "test": "echo 'no tests in shared'",
    "build": "echo 'no build step'"
  },
  "devDependencies": {
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: Write `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `packages/shared/src/signer.ts`**

Copy the full contents of `apps/web/src/types/sealdTypes.ts` verbatim:

```ts
export const SIGNER_STATUSES = [
  'awaiting-you',
  'awaiting-others',
  'completed',
  'declined',
  'expired',
  'draft',
] as const;
export type SignerStatus = (typeof SIGNER_STATUSES)[number];

export const FIELD_KINDS = ['signature', 'initials', 'date', 'text', 'checkbox', 'email'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const SIGNATURE_MODES = ['type', 'draw', 'upload'] as const;
export type SignatureMode = (typeof SIGNATURE_MODES)[number];

export interface Signer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: SignerStatus;
  readonly avatarUrl?: string;
}

export type SignatureValue =
  | { readonly kind: 'typed'; readonly text: string; readonly font: 'caveat' }
  | { readonly kind: 'drawn'; readonly pngDataUrl: string; readonly strokes: number }
  | { readonly kind: 'upload'; readonly pngDataUrl: string; readonly fileName: string };
```

- [ ] **Step 4: Write `packages/shared/src/index.ts`**

```ts
export * from './signer';
```

- [ ] **Step 5: Replace `apps/web/src/types/sealdTypes.ts` with a re-export**

```ts
export * from 'shared';
```

- [ ] **Step 6: Add `shared` to web dependencies**

Edit `apps/web/package.json` dependencies:

```json
"dependencies": {
  "lucide-react": "0.453.0",
  "pdfjs-dist": "^5.6.205",
  "react": "18.3.1",
  "react-dom": "18.3.1",
  "react-router-dom": "^7.14.2",
  "shared": "workspace:*",
  "styled-components": "6.1.13"
}
```

- [ ] **Step 7: Install and verify web still passes**

```bash
pnpm install
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

Expected: all pass. The existing `sealdTypes.test.ts` still runs and passes because the runtime shape is identical.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(shared): extract Signer types into packages/shared"
```

---

## Task 4: Scaffold `apps/api` with `/health`

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.controller.spec.ts`
- Create: `apps/api/jest.config.ts`

- [ ] **Step 1: Write `apps/api/package.json`**

```json
{
  "name": "api",
  "version": "0.0.1",
  "private": true,
  "description": "Seald backend API",
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "lint": "eslint \"{src,test}/**/*.ts\" --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "jest --config test/jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "jose": "^5.9.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "shared": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.0",
    "@nestjs/schematics": "^10.2.0",
    "@nestjs/testing": "^10.4.0",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "20.16.10",
    "@types/supertest": "^6.0.2",
    "@typescript-eslint/eslint-plugin": "7.18.0",
    "@typescript-eslint/parser": "7.18.0",
    "eslint": "8.57.1",
    "eslint-config-prettier": "9.1.0",
    "jest": "^29.7.0",
    "source-map-support": "^0.5.21",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: Write `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "declaration": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "strictNullChecks": true,
    "strictBindCallApply": false,
    "noFallthroughCasesInSwitch": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitAny": false,
    "target": "ES2022",
    "lib": ["ES2022"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

(Nest's generated defaults relax `noUnusedLocals`/`noUnusedParameters` because decorators often reference unused params. Keep consistent with NestJS CLI output.)

- [ ] **Step 3: Write `apps/api/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"]
}
```

- [ ] **Step 4: Write `apps/api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 5: Write `apps/api/jest.config.ts`**

```ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};

export default config;
```

- [ ] **Step 6: Write `apps/api/test/jest-e2e.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

- [ ] **Step 7: Write the failing test `apps/api/src/health/health.controller.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns ok', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 8: Run the failing test**

```bash
pnpm --filter api test
```

Expected: FAIL — `Cannot find module './health.controller'`.

- [ ] **Step 9: Write `apps/api/src/health/health.controller.ts`**

```ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 10: Write `apps/api/src/health/health.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

- [ ] **Step 11: Write `apps/api/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

@Module({ imports: [HealthModule] })
export class AppModule {}
```

- [ ] **Step 12: Write `apps/api/src/main.ts`**

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
```

CORS wiring is added in Task 5 once `ConfigService` exists.

- [ ] **Step 13: Run the test**

```bash
pnpm install
pnpm --filter api test
```

Expected: PASS.

- [ ] **Step 14: Smoke-run the server**

```bash
pnpm --filter api start:dev
```

In another terminal:

```bash
curl -s localhost:3000/health
```

Expected: `{"status":"ok"}`. Then Ctrl-C.

- [ ] **Step 15: Commit**

```bash
git add .
git commit -m "feat(api): scaffold NestJS app with /health endpoint"
```

---

## Task 5: Env validation with zod

**Files:**

- Create: `apps/api/src/config/env.schema.ts`
- Create: `apps/api/src/config/env.schema.spec.ts`
- Create: `apps/api/src/config/config.module.ts`
- Create: `apps/api/.env.example`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Write the failing test `apps/api/src/config/env.schema.spec.ts`**

```ts
import { parseEnv } from './env.schema';

describe('parseEnv', () => {
  const valid = {
    NODE_ENV: 'development',
    PORT: '3000',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    CORS_ORIGIN: 'http://localhost:5173',
  };

  it('parses a valid env', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.SUPABASE_URL).toBe('https://example.supabase.co');
    expect(env.SUPABASE_JWT_AUDIENCE).toBe('authenticated');
  });

  it('defaults SUPABASE_JWT_AUDIENCE to "authenticated"', () => {
    const { SUPABASE_JWT_AUDIENCE: _, ...rest } = valid;
    const env = parseEnv(rest);
    expect(env.SUPABASE_JWT_AUDIENCE).toBe('authenticated');
  });

  it('throws when SUPABASE_URL is missing', () => {
    const { SUPABASE_URL: _, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/SUPABASE_URL/);
  });

  it('throws when SUPABASE_URL is not a valid URL', () => {
    expect(() => parseEnv({ ...valid, SUPABASE_URL: 'not-a-url' })).toThrow(/SUPABASE_URL/);
  });

  it('throws when PORT is not numeric', () => {
    expect(() => parseEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter api test -- env.schema
```

Expected: FAIL — cannot find `./env.schema`.

- [ ] **Step 3: Write `apps/api/src/config/env.schema.ts`**

```ts
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): AppEnv {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter api test -- env.schema
```

Expected: PASS (all 5 cases).

- [ ] **Step 5: Write `apps/api/src/config/config.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { parseEnv, type AppEnv } from './env.schema';

export const APP_ENV = Symbol('APP_ENV');

@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      useFactory: (): AppEnv => parseEnv(process.env),
    },
  ],
  exports: [APP_ENV],
})
export class ConfigModule {}
```

- [ ] **Step 6: Write `apps/api/.env.example`**

```
# Runtime
NODE_ENV=development
PORT=3000

# Supabase Auth (provider-agnostic JWT validation)
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_JWT_AUDIENCE=authenticated

# CORS
CORS_ORIGIN=http://localhost:5173
```

- [ ] **Step 7: Wire `ConfigModule` into `AppModule`**

Replace `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [ConfigModule, HealthModule] })
export class AppModule {}
```

- [ ] **Step 8: Use env in `main.ts` for port and CORS**

Replace `apps/api/src/main.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { APP_ENV } from './config/config.module';
import type { AppEnv } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = app.get<AppEnv>(APP_ENV);

  app.enableCors({ origin: env.CORS_ORIGIN, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.listen(env.PORT);
}

void bootstrap();
```

- [ ] **Step 9: Run the full test suite**

```bash
pnpm --filter api test
pnpm --filter api typecheck
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat(api): add zod env validation and ConfigModule"
```

---

## Task 6: JWKS provider with test helper

**Files:**

- Create: `apps/api/src/auth/jwks.provider.ts`
- Create: `apps/api/src/auth/jwks.provider.spec.ts`
- Create: `apps/api/test/test-jwks.ts`

- [ ] **Step 1: Write `apps/api/test/test-jwks.ts`**

```ts
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { createLocalJWKSet, type JSONWebKeySet } from 'jose';

export interface TestJwks {
  jwks: JSONWebKeySet;
  resolver: ReturnType<typeof createLocalJWKSet>;
  sign: (payload: Record<string, unknown>, options?: SignOptions) => Promise<string>;
}

interface SignOptions {
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  kid?: string;
}

export async function buildTestJwks(): Promise<TestJwks> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk: JWK = await exportJWK(publicKey);
  const kid = 'test-key-1';
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  const jwks: JSONWebKeySet = { keys: [publicJwk] };
  const resolver = createLocalJWKSet(jwks);

  async function sign(
    payload: Record<string, unknown>,
    options: SignOptions = {},
  ): Promise<string> {
    const jwt = new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? kid })
      .setIssuedAt();
    if (options.issuer) jwt.setIssuer(options.issuer);
    if (options.audience) jwt.setAudience(options.audience);
    jwt.setExpirationTime(options.expiresIn ?? '1h');
    return jwt.sign(privateKey);
  }

  return { jwks, resolver, sign };
}
```

- [ ] **Step 2: Write the failing test `apps/api/src/auth/jwks.provider.spec.ts`**

```ts
import { JWKS_RESOLVER, createJwksProvider } from './jwks.provider';
import { buildTestJwks } from '../../test/test-jwks';

describe('JwksProvider factory', () => {
  it('returns a function usable by jwtVerify', async () => {
    const { resolver, sign } = await buildTestJwks();
    // Prove the test helper works with the same resolver shape used in prod.
    const token = await sign({ sub: 'u1' }, { issuer: 'iss', audience: 'aud' });
    expect(typeof token).toBe('string');
    expect(typeof resolver).toBe('function');
  });

  it('exposes the expected DI token', () => {
    expect(typeof JWKS_RESOLVER).toBe('symbol');
    expect(createJwksProvider).toBeInstanceOf(Function);
  });
});
```

- [ ] **Step 3: Run the failing test**

```bash
pnpm --filter api test -- jwks.provider
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write `apps/api/src/auth/jwks.provider.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';

export const JWKS_RESOLVER = Symbol('JWKS_RESOLVER');

export function createJwksProvider() {
  return {
    provide: JWKS_RESOLVER,
    inject: [APP_ENV],
    useFactory: (env: AppEnv): JWTVerifyGetKey => {
      const url = new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
      return createRemoteJWKSet(url);
    },
  };
}
```

- [ ] **Step 5: Run the test**

```bash
pnpm --filter api test -- jwks.provider
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(api): add JWKS_RESOLVER provider and test helper"
```

---

## Task 7: Supabase JWT strategy

**Files:**

- Create: `apps/api/src/auth/auth-user.ts`
- Create: `apps/api/src/auth/supabase-jwt.strategy.ts`
- Create: `apps/api/src/auth/supabase-jwt.strategy.spec.ts`

- [ ] **Step 1: Write `apps/api/src/auth/auth-user.ts`**

```ts
export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly provider: string | null;
}
```

- [ ] **Step 2: Write the failing test `apps/api/src/auth/supabase-jwt.strategy.spec.ts`**

```ts
import { UnauthorizedException } from '@nestjs/common';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';
import { buildTestJwks } from '../../test/test-jwks';
import type { AppEnv } from '../config/env.schema';

const ISSUER = 'https://example.supabase.co/auth/v1';
const AUDIENCE = 'authenticated';

function makeEnv(): AppEnv {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: AUDIENCE,
    CORS_ORIGIN: 'http://localhost:5173',
  };
}

describe('SupabaseJwtStrategy', () => {
  let strategy: SupabaseJwtStrategy;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;

  beforeEach(async () => {
    tk = await buildTestJwks();
    strategy = new SupabaseJwtStrategy(makeEnv(), tk.resolver);
  });

  it('accepts a valid token and returns AuthUser', async () => {
    const token = await tk.sign(
      {
        sub: 'user-1',
        email: 'a@b.com',
        app_metadata: { provider: 'google' },
      },
      { issuer: ISSUER, audience: AUDIENCE },
    );
    const user = await strategy.validate(token);
    expect(user).toEqual({ id: 'user-1', email: 'a@b.com', provider: 'google' });
  });

  it('returns email=null and provider=null when claims are absent', async () => {
    const token = await tk.sign({ sub: 'user-2' }, { issuer: ISSUER, audience: AUDIENCE });
    const user = await strategy.validate(token);
    expect(user).toEqual({ id: 'user-2', email: null, provider: null });
  });

  it('rejects wrong issuer', async () => {
    const token = await tk.sign(
      { sub: 'u' },
      { issuer: 'https://evil.example/auth/v1', audience: AUDIENCE },
    );
    await expect(strategy.validate(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects wrong audience', async () => {
    const token = await tk.sign({ sub: 'u' }, { issuer: ISSUER, audience: 'other' });
    await expect(strategy.validate(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired token', async () => {
    const token = await tk.sign(
      { sub: 'u' },
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '-1s' },
    );
    await expect(strategy.validate(token)).rejects.toMatchObject({
      message: expect.stringMatching(/token_expired/),
    });
  });

  it('rejects missing sub', async () => {
    const token = await tk.sign({}, { issuer: ISSUER, audience: AUDIENCE });
    await expect(strategy.validate(token)).rejects.toMatchObject({
      message: expect.stringMatching(/invalid_token/),
    });
  });

  it('rejects bad signature (different key)', async () => {
    const other = await buildTestJwks();
    const token = await other.sign({ sub: 'u' }, { issuer: ISSUER, audience: AUDIENCE });
    await expect(strategy.validate(token)).rejects.toMatchObject({
      message: expect.stringMatching(/invalid_token/),
    });
  });
});
```

- [ ] **Step 3: Run the failing test**

```bash
pnpm --filter api test -- supabase-jwt.strategy
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write `apps/api/src/auth/supabase-jwt.strategy.ts`**

```ts
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { JWKS_RESOLVER } from './jwks.provider';
import type { AuthUser } from './auth-user';

@Injectable()
export class SupabaseJwtStrategy {
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    @Inject(APP_ENV) env: AppEnv,
    @Inject(JWKS_RESOLVER) private readonly jwks: JWTVerifyGetKey,
  ) {
    this.issuer = `${env.SUPABASE_URL}/auth/v1`;
    this.audience = env.SUPABASE_JWT_AUDIENCE;
  }

  async validate(token: string): Promise<AuthUser> {
    let payload: Record<string, unknown>;
    try {
      const { payload: verified } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      payload = verified as Record<string, unknown>;
    } catch (err) {
      if (err instanceof errors.JWTExpired) {
        throw new UnauthorizedException('token_expired');
      }
      throw new UnauthorizedException('invalid_token');
    }

    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      throw new UnauthorizedException('invalid_token');
    }

    const email =
      typeof payload.email === 'string' && payload.email.length > 0 ? payload.email : null;

    const appMetadata = (payload.app_metadata ?? {}) as Record<string, unknown>;
    const provider =
      typeof appMetadata.provider === 'string' && appMetadata.provider.length > 0
        ? appMetadata.provider
        : null;

    return { id: sub, email, provider };
  }
}
```

- [ ] **Step 5: Run the test**

```bash
pnpm --filter api test -- supabase-jwt.strategy
```

Expected: PASS (all 7 cases).

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(api): add Supabase JWT strategy with jose verification"
```

---

## Task 8: AuthGuard and `@CurrentUser()` decorator

**Files:**

- Create: `apps/api/src/auth/auth.guard.ts`
- Create: `apps/api/src/auth/auth.guard.spec.ts`
- Create: `apps/api/src/auth/current-user.decorator.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing test `apps/api/src/auth/auth.guard.spec.ts`**

```ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';
import type { AuthUser } from './auth-user';

function mockContext(headers: Record<string, string | undefined>, req: any = {}): ExecutionContext {
  const request = { headers, ...req };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeGuard(validate: (token: string) => Promise<AuthUser>) {
  const strategy = { validate } as unknown as SupabaseJwtStrategy;
  return { guard: new AuthGuard(strategy), strategy };
}

describe('AuthGuard', () => {
  it('rejects missing Authorization header', async () => {
    const { guard } = makeGuard(async () => {
      throw new Error('should not be called');
    });
    const ctx = mockContext({});
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      message: 'missing_token',
    });
  });

  it('rejects malformed Authorization header', async () => {
    const { guard } = makeGuard(async () => {
      throw new Error('should not be called');
    });
    const ctx = mockContext({ authorization: 'Basic abc' });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      message: 'missing_token',
    });
  });

  it('delegates to strategy and populates request.user', async () => {
    const user: AuthUser = { id: 'u1', email: 'a@b.com', provider: 'google' };
    const req: any = { headers: { authorization: 'Bearer abc.def.ghi' } };
    const { guard } = makeGuard(async (t) => {
      expect(t).toBe('abc.def.ghi');
      return user;
    });
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual(user);
  });

  it('propagates UnauthorizedException from strategy', async () => {
    const { guard } = makeGuard(async () => {
      throw new UnauthorizedException('token_expired');
    });
    const ctx = mockContext({ authorization: 'Bearer expired' });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      message: 'token_expired',
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter api test -- auth.guard
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/api/src/auth/auth.guard.ts`**

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';
import type { AuthUser } from './auth-user';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly strategy: SupabaseJwtStrategy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();

    const header = req.headers.authorization;
    const token = extractBearer(header);
    if (!token) {
      throw new UnauthorizedException('missing_token');
    }

    req.user = await this.strategy.validate(token);
    return true;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (scheme !== 'Bearer' || !value) return null;
  return value;
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter api test -- auth.guard
```

Expected: PASS (all 4 cases).

- [ ] **Step 5: Write `apps/api/src/auth/current-user.decorator.ts`**

```ts
import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from './auth-user';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!req.user) {
    // This should never happen if AuthGuard ran first; surface it loudly.
    throw new UnauthorizedException('missing_token');
  }
  return req.user;
});
```

- [ ] **Step 6: Write `apps/api/src/auth/auth.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { createJwksProvider } from './jwks.provider';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';

@Module({
  providers: [createJwksProvider(), SupabaseJwtStrategy, AuthGuard],
  exports: [AuthGuard, SupabaseJwtStrategy],
})
export class AuthModule {}
```

- [ ] **Step 7: Wire `AuthModule` into `AppModule`**

Replace `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [ConfigModule, AuthModule, HealthModule] })
export class AppModule {}
```

- [ ] **Step 8: Run the full test suite**

```bash
pnpm --filter api test
pnpm --filter api typecheck
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat(api): add AuthGuard, CurrentUser decorator, AuthModule"
```

---

## Task 9: Protected `/me` endpoint

**Files:**

- Modify: `apps/api/src/health/health.controller.ts`
- Modify: `apps/api/src/health/health.controller.spec.ts`
- Modify: `apps/api/src/health/health.module.ts`

- [ ] **Step 1: Extend the controller spec**

Replace `apps/api/src/health/health.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import type { AuthUser } from '../auth/auth-user';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('returns ok from /health', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('returns the current user from /me', () => {
    const user: AuthUser = { id: 'u1', email: 'a@b.com', provider: 'google' };
    expect(controller.me(user)).toEqual(user);
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter api test -- health.controller
```

Expected: FAIL — `controller.me` does not exist.

- [ ] **Step 3: Update `apps/api/src/health/health.controller.ts`**

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';

@Controller()
export class HealthController {
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
```

- [ ] **Step 4: Wire `AuthModule` into `HealthModule`**

Replace `apps/api/src/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HealthController } from './health.controller';

@Module({ imports: [AuthModule], controllers: [HealthController] })
export class HealthModule {}
```

- [ ] **Step 5: Run the test**

```bash
pnpm --filter api test -- health.controller
```

Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(api): add protected GET /me endpoint"
```

---

## Task 10: E2E tests with supertest

**Files:**

- Create: `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 1: Write the failing e2e test `apps/api/test/auth.e2e-spec.ts`**

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { buildTestJwks } from './test-jwks';

const TEST_ENV: AppEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGIN: 'http://localhost:5173',
};
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;

  beforeAll(async () => {
    tk = await buildTestJwks();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableCors({ origin: TEST_ENV.CORS_ORIGIN, credentials: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('GET /me without Authorization returns 401 missing_token', async () => {
    const res = await request(app.getHttpServer()).get('/me').expect(401);
    expect(res.body.message).toBe('missing_token');
  });

  it('GET /me with expired token returns 401 token_expired', async () => {
    const token = await tk.sign(
      { sub: 'u1' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE, expiresIn: '-1s' },
    );
    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(res.body.message).toBe('token_expired');
  });

  it('GET /me with valid token returns the user', async () => {
    const token = await tk.sign(
      { sub: 'u1', email: 'a@b.com', app_metadata: { provider: 'google' } },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ id: 'u1', email: 'a@b.com', provider: 'google' });
  });

  it('CORS preflight from allowed origin succeeds', async () => {
    await request(app.getHttpServer())
      .options('/health')
      .set('Origin', TEST_ENV.CORS_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
  });

  it('CORS never echoes a caller-supplied origin (browser-enforced block)', async () => {
    // With `origin: CORS_ORIGIN` as a plain string, the cors middleware always
    // echoes the configured origin, never the caller's. A browser receiving this
    // mismatch will block the cross-origin read. This asserts that invariant.
    const res = await request(app.getHttpServer())
      .options('/health')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBe(TEST_ENV.CORS_ORIGIN);
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter api test:e2e
```

Expected: initially FAIL if anything is missing, otherwise PASS. If it fails on `supertest` default export syntax with ESM, change `import request from 'supertest'` to `import * as request from 'supertest'` — pick whichever ts-jest transpiles successfully in this config.

- [ ] **Step 3: Run the full suite**

```bash
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api typecheck
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "test(api): add e2e suite for /health, /me, CORS"
```

---

## Task 11: Common exception filter, README, final wiring

**Files:**

- Create: `apps/api/src/common/filters/http-exception.filter.ts`
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/README.md`
- Modify: root `README.md` (optional short note on workspaces)

- [ ] **Step 1: Write `apps/api/src/common/filters/http-exception.filter.ts`**

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const normalized =
        typeof body === 'string'
          ? { error: body }
          : { error: (body as { message?: string }).message ?? 'error' };
      response.status(status).json(normalized);
      return;
    }

    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(500).json({ error: 'internal_error' });
  }
}
```

- [ ] **Step 2: Wire the filter in `main.ts`**

Replace `apps/api/src/main.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { APP_ENV } from './config/config.module';
import type { AppEnv } from './config/env.schema';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = app.get<AppEnv>(APP_ENV);

  app.enableCors({ origin: env.CORS_ORIGIN, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(env.PORT);
}

void bootstrap();
```

- [ ] **Step 3: Update e2e to match filter response shape**

The filter flattens `{ error: 'missing_token' }` instead of Nest's default `{ message: 'missing_token', statusCode: 401 }`. Update `apps/api/test/auth.e2e-spec.ts` to attach the filter and read `res.body.error`:

After the `ValidationPipe` line in the test bootstrap, add:

```ts
app.useGlobalFilters(new HttpExceptionFilter());
```

And change each `expect(res.body.message).toBe(...)` to `expect(res.body.error).toBe(...)`. Add the import at the top:

```ts
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
```

- [ ] **Step 4: Run e2e again**

```bash
pnpm --filter api test:e2e
```

Expected: all pass with the new response shape.

- [ ] **Step 5: Write `apps/api/README.md`**

````markdown
# Seald API

NestJS backend for the Seald app. Ships provider-agnostic Supabase JWT validation.

## Setup

```bash
cp .env.example .env
# Fill SUPABASE_URL with your project URL; everything else has safe defaults.
pnpm install
pnpm --filter api start:dev
```
````

The server listens on `PORT` (default `3000`).

## Endpoints

| Method | Path    | Auth | Response                  |
| ------ | ------- | ---- | ------------------------- |
| GET    | /health | no   | `{ status: "ok" }`        |
| GET    | /me     | yes  | `{ id, email, provider }` |

## Auth contract

All protected routes require `Authorization: Bearer <supabase-jwt>`. The token is verified against Supabase's JWKS endpoint. The provider claim is informational only — any Supabase-issued JWT is accepted regardless of OAuth provider.

| Condition                                                                    | Response                         |
| ---------------------------------------------------------------------------- | -------------------------------- |
| Missing `Authorization`                                                      | `401 { error: "missing_token" }` |
| Malformed bearer / bad signature / wrong `iss` / wrong `aud` / missing `sub` | `401 { error: "invalid_token" }` |
| Expired                                                                      | `401 { error: "token_expired" }` |

## Testing

```bash
pnpm --filter api test        # unit
pnpm --filter api test:e2e    # e2e (full Nest app)
```

Tests use a locally generated JWKS via `test/test-jwks.ts`; no network is used.

````

- [ ] **Step 6: Run the complete verification**

```bash
pnpm install
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter api test:e2e
pnpm --filter web build
pnpm --filter web build-storybook
````

Expected: every command exits 0.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(api): add HttpExceptionFilter and README"
```

---

## Acceptance criteria (maps to spec §8)

1. Existing frontend runs unchanged from `apps/web/` — verified by Task 2 step 6 and Task 11 step 6.
2. `apps/api` boots; `/health` returns 200; `/me` validates a real Supabase-issued JWT end-to-end — verified by Task 4 step 14 and manual smoke after first deploy.
3. All unit + e2e tests in spec §6 pass locally and in CI — Tasks 4–11.
4. `packages/shared` exists with at least one shared type consumed by both apps — Task 3.
5. Lint + typecheck pass across all workspaces — Task 11 step 6.
6. `apps/api/README.md` documents env setup and the auth contract — Task 11 step 5.
