# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Seald API — multi-stage build
# Builds the NestJS backend (apps/api) and its workspace dependency
# packages/shared. The final runtime image is a Node.js slim with only the
# compiled dist/ + production node_modules + the email templates folder
# (which is read at runtime, not bundled).
# ---------------------------------------------------------------------------

# -------- 1. base: pnpm-ready node --------
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# -------- 2. deps: install full workspace deps (incl. devDeps for build) --------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
# apps/web is excluded from the API image since we only serve API traffic
# from the container. The web app deploys separately (Vercel / static host).
ENV HUSKY=0
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter api... --filter shared

# -------- 3. build: compile shared + api --------
FROM deps AS build
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY tsconfig.base.json ./
RUN pnpm --filter shared build && pnpm --filter api build

# -------- 4. prune: drop devDeps --------
FROM deps AS prune
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --prod --filter api... --filter shared

# -------- 5. runtime --------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps"
# dumb-init for clean SIGTERM propagation → lets the worker's OnModuleDestroy
# run before the container dies mid-seal. postgresql-client is the psql
# binary used by scripts/migrate.sh at container boot.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates dumb-init postgresql-client \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin seald
WORKDIR /app
COPY --from=prune --chown=seald:seald /app/node_modules ./node_modules
COPY --from=prune --chown=seald:seald /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prune --chown=seald:seald /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build --chown=seald:seald /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=seald:seald /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=seald:seald /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=seald:seald /app/apps/api/package.json ./apps/api/package.json
# Email templates are loaded from disk at runtime (MJML → HTML render).
COPY --from=build --chown=seald:seald /app/apps/api/src/email/templates ./apps/api/dist/email/templates
# DB migrations — entrypoint runs them idempotently on every boot.
COPY --from=build --chown=seald:seald /app/apps/api/db ./apps/api/db
COPY --chown=seald:seald apps/api/scripts/migrate.sh apps/api/scripts/entrypoint.sh ./apps/api/scripts/
RUN chmod +x /app/apps/api/scripts/migrate.sh /app/apps/api/scripts/entrypoint.sh

USER seald
EXPOSE 3000
WORKDIR /app/apps/api
ENTRYPOINT ["dumb-init", "--", "/app/apps/api/scripts/entrypoint.sh"]
