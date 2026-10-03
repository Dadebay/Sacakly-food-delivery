# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG NPM_VERSION=11.6.2

FROM ${NODE_IMAGE} AS build
ARG NPM_VERSION
WORKDIR /app
ENV CI=true

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global "npm@${NPM_VERSION}" --no-audit --no-fund

COPY package.json package-lock.json prisma.config.ts nest-cli.json ./
COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY src ./src
RUN npm run build

FROM build AS migration
ENV NODE_ENV=production
USER node
CMD ["npm", "run", "db:deploy"]

FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 4000}/api/v1/health`).then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]
CMD ["node", "dist/src/main.js"]
