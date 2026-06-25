# Multi-stage build for production
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm ci --only=development

# Copy source
COPY src/ ./src/

# Build
RUN npm run build

# Production image
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache git bash

# Create non-root user
RUN addgroup -g 1001 -S codeyang && \
    adduser -u 1001 -S codeyang -G codeyang

WORKDIR /app

# Copy from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create workspace directory
RUN mkdir -p /workspace && \
    chown -R codeyang:codeyang /workspace /app

# Switch to non-root user
USER codeyang

# Set environment
ENV NODE_ENV=production
ENV CODEYANG_WORKSPACE=/workspace

# Expose port (if running as server)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Default command
CMD ["node", "dist/index.js"]
