# ── Stage 1: Install deps ────────────────────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-slim

# Install LibreOffice (required for PDF <-> DOCX conversion)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libreoffice \
      libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

EXPOSE 8000

CMD ["node", "server.js"]
