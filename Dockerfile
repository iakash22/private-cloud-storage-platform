# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS workspace

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.15.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/openapi/package.json packages/openapi/package.json
COPY packages/startup/package.json packages/startup/package.json
COPY packages/testing/package.json packages/testing/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY services/artifact-worker/package.json services/artifact-worker/package.json
COPY services/backup-worker/package.json services/backup-worker/package.json
RUN pnpm install --frozen-lockfile

COPY . .

FROM workspace AS api-build
RUN pnpm --filter @vaultstack/api... build
RUN pnpm --filter @vaultstack/api deploy --prod --ignore-scripts /prod/api

FROM node:22-bookworm-slim AS api-runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=api-build /prod/api ./
COPY --from=api-build /workspace/packages/database/prisma ./prisma

RUN ./node_modules/.bin/prisma generate --schema=/app/prisma/schema.prisma
RUN mkdir -p /data && chown -R node:node /app /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]

FROM workspace AS dashboard-build
ARG VITE_API_URL=/
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @vaultstack/dashboard... build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS dashboard
COPY infrastructure/docker/dashboard.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=dashboard-build /workspace/apps/dashboard/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=5 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
