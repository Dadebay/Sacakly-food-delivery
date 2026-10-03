# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:stable-alpine@sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49
ARG NPM_VERSION=11.6.2

FROM ${NODE_IMAGE} AS dependencies
ARG NPM_VERSION
WORKDIR /workspace
ENV CI=true

RUN npm install --global "npm@${NPM_VERSION}" --no-audit --no-fund

COPY packages/api-contract/package.json ./packages/api-contract/package.json
COPY packages/api-contract/src ./packages/api-contract/src
COPY apps/admin/package.json apps/admin/package-lock.json ./apps/admin/
RUN --mount=type=cache,target=/root/.npm \
  npm ci --prefix apps/admin --no-audit --no-fund

FROM dependencies AS build
ARG VITE_API_URL=/api/v1
ARG VITE_MAP_TILE_URL=/tiles/styles/alowalow/{z}/{x}/{y}.png
ARG VITE_MAP_ATTRIBUTION="© OpenStreetMap contributors"
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_MAP_TILE_URL=${VITE_MAP_TILE_URL}
ENV VITE_MAP_ATTRIBUTION=${VITE_MAP_ATTRIBUTION}
COPY apps/admin ./apps/admin
RUN npm --prefix apps/admin run build

FROM ${NGINX_IMAGE} AS runtime
COPY --chown=101:101 apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /workspace/apps/admin/dist/client /usr/share/nginx/html

USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "--quiet", "--tries=1", "--spider", "http://127.0.0.1:8080/"]
