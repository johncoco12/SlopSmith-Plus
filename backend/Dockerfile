# Build context: repo root (set context: . in compose, dockerfile: backend/Dockerfile)

# ── Stage 1: Build RsCli ─────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim AS rscli-builder
ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1

RUN git clone --depth 1 https://github.com/iminashi/Rocksmith2014.NET.git /tmp/rs2014

COPY backend/tools/rscli/RsCli.fsproj /tmp/rs2014/tools/RsCli/
COPY backend/tools/rscli/Program.fs /tmp/rs2014/tools/RsCli/

RUN find /tmp/rs2014 \( -name "*.fsproj" -o -name "*.csproj" -o -name "Directory.Build.props" \) \
      -exec sed -i 's|net10\.0|net8.0|g' {} + \
    && sed -i 's|</PropertyGroup>|<NuGetAudit>false</NuGetAudit></PropertyGroup>|' /tmp/rs2014/Directory.Build.props \
    && cd /tmp/rs2014/tools/RsCli \
    && arch="${TARGETARCH:-$(dpkg --print-architecture)}" \
    && case "$arch" in \
         arm64|aarch64) RID=linux-arm64 ;; \
         amd64|x86_64)  RID=linux-x64  ;; \
         *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
       esac \
    && dotnet publish -c Release -r "$RID" --self-contained -o /opt/rscli -v minimal 2>&1

# ── Stage 2: Build vgmstream-cli ─────────────────────────────────────────
FROM debian:bookworm-slim AS vgmstream-builder
ARG VGMSTREAM_REF=r2083

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake pkg-config yasm git ca-certificates \
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

# Compiled backend: tsconfig outDir=dist, so src/index.ts → dist/index.js
COPY --from=ts-builder /build/dist ./dist/

# Assets served by the backend
COPY plugins/ ./plugins/
COPY VERSION ./

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV RSCLI_PATH=/opt/rscli/RsCli
ENV VGMSTREAM_CLI=/usr/local/bin/vgmstream-cli
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
ENV LOG_PRETTY=true

EXPOSE 8080

# db push creates/updates the schema on every start (idempotent, works with PostgreSQL)
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
