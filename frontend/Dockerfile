# Frontend Dockerfile
# Multi-stage build for React + Vite frontend

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS builder

WORKDIR /app
RUN chown node:node /app
USER node

# Copy package files
COPY --chown=node:node package*.json ./

# Install dependencies
RUN npm ci --no-audit --no-fund

# Copy source code
COPY --chown=node:node . .

# Vite embeds these public Supabase settings at build time.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY"

# Build the application
RUN npm run build

# Production stage - serve with nginx
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03 AS production

# Copy built static files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/nginx-main.conf /etc/nginx/nginx.conf
USER 101:101

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
