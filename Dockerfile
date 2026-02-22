# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies for better-sqlite3 if needed
# (usually slim is enough if we copy the built node_modules)

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/rankings.db ./rankings.db

# Cloud Run expects the app to listen on PORT environment variable
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Use tsx to run the server.ts directly in production as well
# Or you could compile it to JS, but tsx is already in dependencies
CMD ["npx", "tsx", "server.ts"]
