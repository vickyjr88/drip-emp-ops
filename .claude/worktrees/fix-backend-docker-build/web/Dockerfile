FROM node:18-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm install

FROM node:18-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:18-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app ./
RUN npm prune --omit=dev

EXPOSE 3002
CMD ["npm", "run", "start"]
