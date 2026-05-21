# Build context: repo root (set context: . in compose, dockerfile: backend/Dockerfile)

# ── Stage 1: Build RsCli ─────────────────────────────────────────────────
FROM debian:bookworm-slim AS rscli-builder
ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends curl git && rm -rf /var/lib/apt/lists/*

RUN curl -sL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel 10.0 --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet

ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1

RUN git clone --depth 1 https://github.com/iminashi/Rocksmith2014.NET.git /tmp/rs2014

COPY rscli/RsCli.fsproj /tmp/rs2014/tools/RsCli/
COPY rscli/Program.fs /tmp/rs2014/tools/RsCli/

RUN sed -i 's|</PropertyGroup>|<NuGetAudit>false</NuGetAudit></PropertyGroup>|' /tmp/rs2014/Directory.Build.props \
    && cd /tmp/rs2014/tools/RsCli \
    && arch="${TARGETARCH:-$(dpkg --print-architecture)}" \
    && case "$arch" in \
         arm64|aarch64) RID=linux-arm64 ;; \
         amd64|x86_64)  RID=linux-x64  ;; \
         *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
       esac \
    && dotnet publish -c Release -r "$RID" --self-contained -o /opt/rscli

# ── Stage 2: Build vgmstream-cli ─────────────────────────────────────────
FROM debian:bookworm-slim AS vgmstream-builder
ARG VGMSTREAM_REF=r2083

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake pkg-config yasm git \
    libmpg123-dev libvorbis-dev libspeex-dev libopus-dev \
    libavformat-dev libavcodec-dev libavutil-dev libswresample-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch "${VGMSTREAM_REF}" https://github.com/vgmstream/vgmstream.git /tmp/vgmstream

RUN cmake -S /tmp/vgmstream -B /tmp/vgmstream/build \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_V123=OFF \
        -DBUILD_AUDACIOUS=OFF \
        -DBUILD_SHARED_LIBS=OFF \
    && cmake --build /tmp/vgmstream/build --target vgmstream_cli -j"$(nproc)" \
    && cp /tmp/vgmstream/build/cli/vgmstream-cli /usr/local/bin/vgmstream-cli

# ── Stage 3: Compile TypeScript ───────────────────────────────────────────
FROM node:20-slim AS ts-builder
WORKDIR /build

COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma/ ./prisma/
RUN npm ci

COPY backend/src/ ./src/
COPY backend/tsconfig.json ./
RUN npx prisma generate && npm run build

# ── Stage 4: Final image ──────────────────────────────────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fluidsynth \
    fluid-soundfont-gm \
    libsndfile1 \
    curl \
    megatools \
    libmpg123-0 \
    libvorbisfile3 \
    libspeex1 \
    libopus0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=vgmstream-builder /usr/local/bin/vgmstream-cli /usr/local/bin/vgmstream-cli
COPY --from=rscli-builder /opt/rscli /opt/rscli

WORKDIR /app

# Install runtime deps (includes prisma CLI for db push at startup)
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma/ ./prisma/
RUN npm ci --omit=dev && npm install --no-save prisma && npx prisma generate

# Compiled backend (dist/src/ → /app/dist/src/, so ../../plugins = /app/plugins)
COPY --from=ts-builder /build/dist ./dist/

# Assets served by the backend
COPY static/ ./static/
COPY plugins/ ./plugins/
COPY VERSION ./

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV RSCLI_PATH=/opt/rscli/RsCli
ENV VGMSTREAM_CLI=/usr/local/bin/vgmstream-cli
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
ENV DATABASE_URL=file:/config/web_library.db
ENV LOG_PRETTY=true

EXPOSE 8080

# db push creates/updates the schema on every start (idempotent for SQLite)
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/src/index.js"]
