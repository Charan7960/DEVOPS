# Use official Node.js LTS image as base
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files first (Docker layer caching optimization)
# This way, if only source code changes, npm install is NOT re-run
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application source code
COPY . .

# Expose the port the server listens on
EXPOSE 3000

# Health check — Docker uses this to know if the container is healthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Command to start the server
CMD ["node", "server.js"]
