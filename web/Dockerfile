FROM node:18-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm install

FROM node:18-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Baked into the client bundle by `next build`; a runtime env var is too late.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# The site's own public origin. Canonical URLs, Open Graph tags and every
# sitemap entry are absolute, so a wrong value here points search engines and
# social scrapers at the wrong host. Also build-time: sitemap.xml and robots.txt
# are generated during `next build`.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM node:18-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app ./
RUN npm prune --omit=dev

EXPOSE 3002
CMD ["npm", "run", "start"]
