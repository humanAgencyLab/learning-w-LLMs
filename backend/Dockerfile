# Use the official Node.js runtime as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
# Use npm install if package-lock.json doesn't exist, otherwise use npm ci
RUN if [ -f package-lock.json ]; then npm ci --omit=dev && npm cache clean --force; else npm install --omit=dev && npm cache clean --force; fi

# Copy application code
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

