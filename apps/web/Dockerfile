# syntax=docker/dockerfile:1.7
###############################################################################
# Project 50 — web (Next.js) image for Azure Container Apps
#
# This is a pnpm MONOREPO and the app uses Prisma. Both are classic Docker
# gotchas, handled explicitly here:
#
#   * MONOREPO: Next is configured with `output: "standalone"` and
#     `experimental.outputFileTracingRoot = <repo root>` (apps/web/next.config.mjs),
#     so the standalone trace reaches the sibling @project50/* workspace packages.
#     With the root at the monorepo root, the standalone server entrypoint lands
#     at `.next/standalone/apps/web/server.js` (NOT `.next/standalone/server.js`).
#
#   * PRISMA: the standalone trace does NOT pick up @prisma/client or the
#     generated client + query engine (the client is reached through a pnpm
#     symlink the tracer doesn't follow). So the runner stage copies the
#     generated Prisma client package (which bundles the `.prisma/client`
#     engine for the container's platform) out of the pnpm store and re-creates
#     the top-level `node_modules/@prisma/client` + `node_modules/.prisma`
#     entries the runtime resolves. binaryTargets in schema.prisma include the
#     Debian (glibc/openssl-3.0) targets node:20-bookworm-slim needs.
#
# Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile -t p50web:test .
###############################################################################

# ---- base -------------------------------------------------------------------
# bookworm-slim (Debian 12) ships glibc + openssl 3.0, which the Prisma query
# engine (debian-openssl-3.0.x / linux-arm64-openssl-3.0.x) links against.
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# corepack ships with node:20; pin pnpm to the repo's packageManager version.
RUN corepack enable
WORKDIR /repo

# ---- deps -------------------------------------------------------------------
# Install the full workspace from the lockfile. Copy only the manifests +
# lockfile first so this layer caches until a package.json or the lock changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json            apps/web/package.json
COPY packages/config/package.json     packages/config/package.json
COPY packages/core/package.json       packages/core/package.json
COPY packages/db/package.json         packages/db/package.json
COPY packages/recap/package.json      packages/recap/package.json
COPY packages/ui/package.json         packages/ui/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM base AS build
# Bring in the installed node_modules (root + per-package symlinks + .pnpm store).
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps ./apps
COPY --from=deps /repo/packages ./packages
# Now the full source.
COPY . .
# Generate the Prisma client (writes the engines for the binaryTargets in
# schema.prisma into the pnpm store at node_modules/.pnpm/@prisma+client*/.../.prisma).
RUN pnpm --filter @project50/db exec prisma generate

# Remotion externals fix. next.config.mjs marks `remotion`, `@remotion/bundler`
# and `@remotion/renderer` as server externals (they ship native binaries that
# can't be webpack-bundled), so the compiled server emits bare
# `require("remotion")` calls. These packages are deps of @project50/recap, so
# under pnpm they're only resolvable from packages/recap — NOT from apps/web,
# where the compiled `.next/server` output lives. Next's collect-page-data step
# evaluates the recap route module, which eagerly imports `remotion`, so the
# build needs these resolvable from the app. Symlink each into
# apps/web/node_modules (resolving the real pnpm-store path from recap, so no
# version hashes are hard-coded). Mirrors what a hoisted install would provide.
RUN set -eux; \
    mkdir -p apps/web/node_modules/@remotion; \
    for spec in remotion @remotion/bundler @remotion/renderer; do \
      target="$(node -e "process.stdout.write(require('path').dirname(require.resolve('${spec}/package.json',{paths:['packages/recap']})))")"; \
      link="apps/web/node_modules/${spec}"; \
      rm -rf "$link"; \
      ln -s "$target" "$link"; \
    done
# Build the Next standalone output. A DATABASE_URL is required for the datasource
# env() to validate at build/collect time; it is a dummy and never connected to.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
# Give the Next/webpack build headroom; the default heap can OOM on large apps.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm --filter @project50/web build

# Resolve the concrete pnpm store path of the generated @prisma/client package
# (it embeds the prisma version hash) and stage it for the runner under a stable
# path, so the runner COPY does not need to hard-code the hash.
RUN set -eux; \
    # @prisma/client is a dep of @project50/db, so resolve it FROM packages/db
    # (under pnpm it isn't resolvable from the repo root).
    src="$(dirname "$(node -e "process.stdout.write(require.resolve('@prisma/client/package.json',{paths:['packages/db']}))")")"; \
    # src = .../node_modules/.pnpm/@prisma+client@<ver>_<hash>/node_modules/@prisma/client
    pnpm_pkg_nm="$(dirname "$(dirname "$src")")"; \
    # The generated Prisma client embeds its own .pnpm dir name in the engine
    # search path; capture it so the runner can recreate that exact location.
    pnpm_dir="$(basename "$(dirname "$pnpm_pkg_nm")")"; \
    mkdir -p /prisma-stage; \
    cp -aL "$pnpm_pkg_nm/@prisma" /prisma-stage/@prisma; \
    cp -aL "$pnpm_pkg_nm/.prisma" /prisma-stage/.prisma; \
    printf '%s' "$pnpm_dir" > /prisma-stage/pnpm_dir.txt

# ---- runner -----------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# bookworm-slim omits the openssl runtime libs. Without libssl present, Prisma
# cannot detect the OpenSSL version, wrongly defaults to openssl-1.1.x, and then
# fails to load the (openssl-3.0.x) query engine. Install openssl + CA certs so
# Prisma detects 3.0 and TLS works for outbound DB/HTTPS connections.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Standalone server: includes a minimal traced node_modules, the workspace
# packages, and the per-app .next server output. server.js sits under apps/web.
COPY --from=build /repo/apps/web/.next/standalone ./
# Static assets and public files are NOT part of the standalone trace; copy them
# into the locations server.js expects (relative to apps/web/server.js).
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

# Prisma runtime. Two placements are needed:
#   1. Top-level node_modules/@prisma/client + node_modules/.prisma so a bare
#      `require("@prisma/client")` from the compiled server resolves and its
#      internal `require('.prisma/client')` finds the engine as a sibling.
#   2. The ORIGINAL pnpm-store path (node_modules/.pnpm/@prisma+client@.../...),
#      because the generated client embeds that absolute path in its engine
#      search list — recreating it guarantees the engine is found regardless of
#      which resolution branch Prisma takes at runtime.
COPY --from=build /prisma-stage/@prisma ./node_modules/@prisma
COPY --from=build /prisma-stage/.prisma ./node_modules/.prisma
COPY --from=build /prisma-stage/@prisma /tmp/prisma-stage/@prisma
COPY --from=build /prisma-stage/.prisma /tmp/prisma-stage/.prisma
COPY --from=build /prisma-stage/pnpm_dir.txt /tmp/prisma-stage/pnpm_dir.txt
RUN set -eux; \
    pnpm_dir="$(cat /tmp/prisma-stage/pnpm_dir.txt)"; \
    dest="node_modules/.pnpm/${pnpm_dir}/node_modules"; \
    mkdir -p "$dest"; \
    cp -a /tmp/prisma-stage/@prisma "$dest/@prisma"; \
    cp -a /tmp/prisma-stage/.prisma "$dest/.prisma"; \
    rm -rf /tmp/prisma-stage

# Drop privileges. node:20 images ship an unprivileged `node` user.
RUN chown -R node:node /app
USER node

EXPOSE 3000
# Monorepo standalone entrypoint.
CMD ["node", "apps/web/server.js"]
