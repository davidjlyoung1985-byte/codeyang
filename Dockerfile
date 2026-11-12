# Multi-stage build for CodeYang
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY tsup.config.ts ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build the project
RUN npm run build

# Production stage
FROM node:18-alpine

# Install runtime dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create workspace directory
RUN mkdir -p /workspace

# Set environment variables
ENV NODE_ENV=production
ENV CODEYANG_WORKSPACE=/workspace

# Expose web server port (if using web UI)
EXPOSE 3000

# Create volume for workspace
VOLUME ["/workspace"]

# Create volume for config
VOLUME ["/root/.codeyang"]

# Set entrypoint
ENTRYPOINT ["node", "dist/index.js"]

# Default command (can be overridden)
CMD []
