FROM node:18-bullseye-slim

# Create app directory
WORKDIR /usr/src/app

# Install dependencies (use package-lock if present)
COPY package*.json ./

# Prefer npm ci for reproducible installs in CI/CD
RUN npm ci --only=production

# Copy source
COPY . .

# Expose port used by the app
EXPOSE 5000

# Start the server
CMD ["node", "server.js"]
