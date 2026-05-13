# Multi-stage Dockerfile for optimized image size

# Stage 1: Dependencies
FROM node:18-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
# Using npm install --omit=dev instead of npm ci to handle lock file sync issues
RUN npm install --omit=dev --no-audit --no-fund && \
    npm cache clean --force && \
    rm -rf /tmp/* /var/cache/apk/*

# Stage 2: Production image
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy only production dependencies from deps stage
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy package files
COPY --chown=nodejs:nodejs package*.json ./

# Create uploads directory with correct permissions
RUN mkdir -p /app/uploads && \
    chown -R nodejs:nodejs /app

# Copy application code
COPY --chown=nodejs:nodejs . .

# Remove unnecessary files to reduce image size (before switching user)
RUN rm -rf \
    /app/.git \
    /app/.gitignore \
    /app/*.md \
    /app/test*.js \
    /app/test* \
    /app/*.test.js \
    /app/.env.example \
    /app/Dockerfile* \
    /app/docker-compose*.yml \
    /app/.vscode \
    /app/.idea 2>/dev/null || true && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "src/app.js"]
