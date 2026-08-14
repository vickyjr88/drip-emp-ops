FROM node:18-alpine AS builder
WORKDIR /app

# Install OpenSSL for Prisma, and build tools for bcrypt's native bindings
RUN apk add --no-cache openssl python3 make g++

# Skip Puppeteer's bundled Chromium download at install time; the runtime
# image installs system Chromium via apk instead (musl-compatible).
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm install --silent

# Generate Prisma client
RUN npm run prisma:generate

# Copy source code
COPY . ./

# Build the application
RUN npm run build

# Production image
FROM node:18-alpine AS runtime
WORKDIR /app

# Chromium backs PDF generation (see PdfService) and pulls ~180 packages from
# Alpine's CDN. A partial index fetch leaves apk unable to resolve Chromium's
# shared libraries -- it reports "so:libpango-1.0.so.0 (no such package)" rather
# than a network error, which is misleading. So: refresh the index first, retry
# the whole step on transient failures, and keep the package cache mounted so a
# retry resumes instead of re-downloading everything.
RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
    set -eux; \
    for attempt in 1 2 3; do \
      apk update && apk add --cache-dir /var/cache/apk openssl chromium && break; \
      echo "apk attempt ${attempt} failed; retrying"; \
      rm -rf /var/cache/apk/APKINDEX.*; \
      sleep 10; \
    done; \
    command -v chromium-browser >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# chmod here rather than relying on the checked-in bit, which does not survive
# every checkout (Windows clones, archive exports).
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Reuse node_modules already built (and native bindings compiled) in the
# builder stage instead of reinstalling build tools here, then prune dev deps.
COPY --from=builder /app/node_modules ./node_modules
# `prisma` is a devDependency, so the prune would remove the CLI that the
# entrypoint needs for `migrate deploy`. Keep it: the entrypoint runs on every
# container start, including on hosts with no network, so it cannot depend on
# npx fetching the CLI on demand. Pinned to the same version as the client to
# avoid a drifting CLI/engine pair.
RUN npm prune --omit=dev \
    && npm install --no-save --silent prisma@5.22.0
RUN npx prisma generate

EXPOSE 3100
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
