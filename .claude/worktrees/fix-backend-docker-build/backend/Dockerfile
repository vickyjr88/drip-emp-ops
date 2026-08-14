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

RUN apk add --no-cache openssl chromium

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
RUN apk add --no-cache --virtual .build-deps python3 make g++
RUN --mount=type=cache,target=/root/.npm npm ci --only=production --silent
RUN apk del .build-deps
RUN npx prisma generate

EXPOSE 3100
CMD ["node", "dist/main.js"]
