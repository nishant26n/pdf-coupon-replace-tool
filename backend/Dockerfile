# ── Stage 1: Install deps ────────────────────────────────────────────────────
# Build context is the REPO ROOT (set by Render when Dockerfile Path = ./backend/Dockerfile)
# so all COPY paths are relative to the repo root.
FROM node:20-slim AS deps

WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-slim

# Pre-accept the MS Core Fonts EULA so the install runs unattended.
RUN echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" \
      | debconf-set-selections

# Install LibreOffice (required for PDF <-> DOCX conversion) plus the
# metric-compatible fonts that match what Windows hosts ship with. These
# fonts are essential: when LibreOffice converts PDF -> DOCX -> PDF on a
# host that lacks Arial / Calibri / Cambria, glyph widths drop to a
# fallback (Liberation / DejaVu) and frame positions shift, producing
# extra blank space on the left and re-flowed lines compared to local.
#
#   fonts-crosextra-carlito         metric-identical drop-in for Calibri
#   fonts-crosextra-caladea         metric-identical drop-in for Cambria
#   ttf-mscorefonts-installer       real Arial / Times New Roman / Courier New / Verdana / Georgia
#   fonts-liberation                metric-compatible Arial / Times / Courier (fallback)
#   fonts-dejavu-core, fonts-noto-core   broad coverage for the rest
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libreoffice \
      libglib2.0-0 \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-core \
      fonts-crosextra-carlito \
      fonts-crosextra-caladea \
      ttf-mscorefonts-installer \
      ca-certificates \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source from backend/ subfolder into /app
COPY backend/ .

ENV NODE_ENV=production
ENV PORT=8000
ENV SOFFICE_BIN=/usr/bin/soffice

EXPOSE 8000

CMD ["node", "server.js"]
