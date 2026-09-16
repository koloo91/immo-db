# ==========================================
# Stage 1: Build Stage
# ==========================================
FROM node:22-bookworm-slim AS builder

# Install build dependencies required for native C++ addons (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install bun for fast dependency installation & build
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Copy dependency specifications
COPY package.json bun.lock* ./

# Install dependencies (will compile better-sqlite3 with python3 & g++)
RUN bun install --frozen-lockfile

# Copy application source code
COPY . .

# Build Nuxt application
RUN bun run build

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install runtime dependencies needed by native Node addons (e.g. better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libatomic1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Create persistent storage directories for SQLite and uploads
RUN mkdir -p /app/data /app/storage/uploads

# Copy built application output from builder stage
COPY --from=builder /app/.output /app/.output
COPY --from=builder /app/drizzle /app/drizzle

# Expose standard port
EXPOSE 3000

# Declare persistent volumes
VOLUME ["/app/data", "/app/storage"]

# Start Nuxt Nitro node-server
CMD ["node", ".output/server/index.mjs"]
