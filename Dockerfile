# syntax=docker/dockerfile:1.7

FROM node:24.15.0-alpine3.23 AS base
WORKDIR /app
RUN corepack enable

FROM base AS migration-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY deploy/migrator/package.json ./deploy/migrator/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --prod --filter @growth-tracking/migrator && \
    pnpm --filter @growth-tracking/migrator deploy --prod /opt/migrate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY deploy/migrator/package.json ./deploy/migrator/package.json
COPY vendor/xlsx-0.20.3.tgz ./vendor/xlsx-0.20.3.tgz
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
ARG BUILD_DB_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
ARG BUILD_AUTH_KEY=build-only-placeholder-not-used-at-runtime
ARG BUILD_AUTH_ORIGIN=http://127.0.0.1:3000
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL $BUILD_DB_URL
ENV AUTH_SECRET $BUILD_AUTH_KEY
ENV AUTH_URL $BUILD_AUTH_ORIGIN
RUN pnpm db:generate && pnpm build

# Compose-only maintenance image. It keeps the locked application toolchain,
# generated Prisma Client, scripts and import workbook out of runtime images.
FROM deps AS ops
COPY . .
ARG BUILD_DB_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
ENV NODE_ENV=production \
    DATABASE_URL=$BUILD_DB_URL
RUN pnpm db:generate
CMD ["pnpm", "--help"]

FROM node:24.15.0-alpine3.23 AS migrator
WORKDIR /opt/migrate
COPY --from=migration-deps /opt/migrate ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
ENV NODE_ENV=production
CMD ["node_modules/.bin/prisma", "migrate", "deploy", "--config", "prisma.config.ts"]

FROM node:24.15.0-alpine3.23 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',{cache:'no-store'}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]

# Railway's pre-deploy container needs the pinned Prisma CLI and migrations.
# Compose targets the smaller runner image for normal application traffic.
FROM runner AS railway
USER root
COPY --from=migration-deps --chown=nextjs:nodejs /opt/migrate /opt/migrate
COPY --from=builder --chown=nextjs:nodejs /app/prisma /opt/migrate/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts /opt/migrate/prisma.config.ts
USER nextjs
