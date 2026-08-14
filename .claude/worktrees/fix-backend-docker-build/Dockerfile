FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --silent

# Copy source code
COPY . ./

# Build the application (adjust as needed for frontend/backend)
RUN npm run build

# Production image
FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production --silent

EXPOSE 3000
CMD ["node", "dist/main.js"]
