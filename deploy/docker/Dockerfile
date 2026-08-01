# syntax=docker/dockerfile:1.18.0@sha256:dabfc0969b935b2080555ace70ee69a5261af8a8f1b4df97b9e7fbcf6722eddf

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS build

WORKDIR /workspace

COPY scripts/bootstrap-npm.sh ./scripts/bootstrap-npm.sh
RUN ./scripts/bootstrap-npm.sh

COPY package.json package-lock.json .npmrc ./
# Every dependency is public, so the build needs no registry credential.
RUN npm ci --ignore-scripts

COPY biome.json index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
# vite.config.ts imports the development proxy plugin, which deactivates itself
# for a production build. The image serves static files only and never proxies.
COPY server ./server

RUN --network=none npm run build \
    && npm cache clean --force

FROM cgr.dev/chainguard/nginx:latest@sha256:e4ff957080737c90a9ecfeaa40e3d19ea9d687e9cacda2f2a031c75ffcdd72b7

COPY --chown=65532:65532 deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=65532:65532 /workspace/dist /usr/share/nginx/html

USER 65532:65532
EXPOSE 8080

ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
