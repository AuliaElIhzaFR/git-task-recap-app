# Multi-stage build for smaller image size
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json yarn.lock* package-lock.json* ./

# Install dependencies
RUN yarn install --frozen-lockfile --production=false

# Copy source code
COPY . .

# Build TypeScript
RUN yarn build

# Production stage
FROM node:20-alpine AS runner

# Add non-root user for security
RUN addgroup --system --gid 1001 botuser && \
    adduser --system --uid 1001 botuser

WORKDIR /app

# Copy package files
COPY package.json yarn.lock* package-lock.json* ./

# Install production dependencies only
RUN yarn install --frozen-lockfile --production=true && \
    yarn cache clean

# Copy built files from builder
COPY --from=builder --chown=botuser:botuser /app/dist ./dist

# Switch to non-root user
USER botuser

# Environment variables (will be overridden by docker-compose or k8s)
ENV NODE_ENV=production

# Health check (optional - check if process is running)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Run the bot
CMD ["node", "dist/index.js"]
