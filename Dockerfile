# Root Dockerfile for Railway: builds and runs the backend service
# This copies the backend folder and runs it with Node 18

FROM node:18-bullseye-slim AS builder
WORKDIR /app

# Copy backend package files and install deps
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY backend/ ./

# Production image
FROM node:18-bullseye-slim
WORKDIR /app

# Copy installed node modules and source from builder
COPY --from=builder /app /app

EXPOSE 5000

# Default command
CMD ["node", "server.js"]
