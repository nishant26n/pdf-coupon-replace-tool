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

# Enable Debian `contrib` (where `ttf-mscorefonts-installer` lives).
# node:20-slim uses the deb822 sources format at
# /etc/apt/sources.list.d/debian.sources; add a contrib component line
# either way to handle both layouts.
RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i 's|^Components: main$|Components: main contrib non-free non-free-firmware|' \
        /etc/apt/sources.list.d/debian.sources; \
    else \
      echo "deb http://deb.debian.org/debian bookworm main contrib non-free" \
        > /etc/apt/sources.list.d/contrib.list; \
    fi

# Install LibreOffice + metric-compatible fonts that match what Windows
# hosts ship with. Without these, LibreOffice falls back to Liberation /
# DejaVu when re-rendering DOCX -> PDF, glyph widths shift, and the
# output has extra blank space on the left.
#
#   fonts-crosextra-carlito        metric-identical drop-in for Calibri
#   fonts-crosextra-caladea        metric-identical drop-in for Cambria
#   fonts-liberation               metric-compatible Arial / Times / Courier
#   fonts-dejavu-core, fonts-noto-core    broad coverage
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libreoffice \
      libglib2.0-0 \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-core \
      fonts-crosextra-carlito \
      fonts-crosextra-caladea \
      ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Try to install MS Core Fonts (real Arial / Times New Roman / Courier
# New / Verdana / Georgia). The installer downloads from SourceForge at
# build time and that mirror is occasionally unavailable, so we run this
# in its own layer with `|| true` — a build with the metric-compatible
# substitutes above is still correct, just one notch less faithful.
RUN apt-get update && \
    (apt-get install -y --no-install-recommends ttf-mscorefonts-installer || \
       echo "WARN: ttf-mscorefonts-installer failed; continuing with carlito/caladea/liberation") && \
    rm -rf /var/lib/apt/lists/*

# Refresh font cache once at the end so LibreOffice sees every font.
RUN fc-cache -f

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
