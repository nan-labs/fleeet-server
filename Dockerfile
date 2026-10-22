# Multi-stage Dockerfile for fleeet-server

FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/server/package.json ./apps/server/

# Install dependencies
RUN npm ci

# Copy source
COPY packages/core ./packages/core
COPY apps/server ./apps/server
COPY scripts ./scripts

# Production image
FROM node:22-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 fleeet && \
    adduser -D -u 1001 -G fleeet fleeet

# Copy from builder
COPY --from=builder --chown=fleeet:fleeet /app/node_modules ./node_modules
COPY --from=builder --chown=fleeet:fleeet /app/packages ./packages
COPY --from=builder --chown=fleeet:fleeet /app/apps/server ./apps/server

USER fleeet
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r => r.ok ? process.exit(0) : process.exit(1))"

CMD ["node", "apps/server/src/index.mjs"]
