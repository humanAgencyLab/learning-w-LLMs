# Use the official Node.js runtime as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only) from the COMMITTED lockfile.
# Hard-fail rather than falling back to `npm install`: the silent fallback is
# how every image before 2026-08-12 came to be built from freshly resolved
# versions instead of the lockfile, which makes a rebuild non-reproducible and
# a Node-version regression impossible to attribute.
RUN test -f package-lock.json || (echo "FATAL: package-lock.json missing from the build context (check .dockerignore)" && exit 1)
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code
# Force copy to ensure latest routes are included
COPY routes/ ./routes/
COPY . .

# Create directory for uploads if it doesn't exist
RUN mkdir -p uploads/avatars uploads/certificates

# Expose port (Cloud Run sets PORT env var automatically)
EXPOSE 8080

# Set NODE_ENV to production
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]

