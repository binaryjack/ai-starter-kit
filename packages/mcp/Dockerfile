# G-41: Multi-stage Dockerfile for the MCP server
# ─────────────────────────────────────────────────
# Stage 1: builder  — install all deps, compile TypeScript
# Stage 2: runtime  — minimal Node 20 alpine image

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace manifests first (layer-cache friendly)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY packages/agent-executor/package.json   ./packages/agent-executor/
COPY packages/cli/package.json              ./packages/cli/
COPY packages/core/package.json             ./packages/core/
COPY packages/mcp/package.json              ./packages/mcp/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/

# Compile
RUN pnpm --filter @ai-agencee/engine run build \
 && pnpm --filter @ai-agencee/core run build \
 && pnpm --filter @ai-agencee/mcp run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Security: run as non-root user
RUN addgroup -S aikit && adduser -S aikit -G aikit

WORKDIR /app

# Only install production deps
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy manifests + lock
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json /app/tsconfig.json ./
COPY --from=builder /app/packages/agent-executor/package.json  ./packages/agent-executor/
COPY --from=builder /app/packages/cli/package.json             ./packages/cli/
COPY --from=builder /app/packages/core/package.json            ./packages/core/
COPY --from=builder /app/packages/mcp/package.json             ./packages/mcp/

RUN pnpm install --frozen-lockfile --prod

# Copy compiled output
COPY --from=builder /app/packages/agent-executor/dist  ./packages/agent-executor/dist
COPY --from=builder /app/packages/cli/dist             ./packages/cli/dist
COPY --from=builder /app/packages/core/dist            ./packages/core/dist
COPY --from=builder /app/packages/mcp/dist             ./packages/mcp/dist

# Copy agent definitions
COPY agents/ ./agents/

RUN chown -R aikit:aikit /app
USER aikit

# MCP uses stdio transport — no port exposed by default.
# SSE server is optional on AIKIT_SSE_PORT (default 3747).
EXPOSE 3747

# Health check: ping the SSE endpoint if running
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:${AIKIT_SSE_PORT:-3747}/health || exit 0

ENV NODE_ENV=production

CMD ["node", "packages/mcp/dist/index.js"]
