### Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

### Production stage: serve with nginx
FROM nginx:stable-alpine
COPY --from=builder /app/build /usr/share/nginx/html

# Expose port 80
EXPOSE 80
EXPOSE 5001

CMD ["nginx", "-g", "daemon off;"]
