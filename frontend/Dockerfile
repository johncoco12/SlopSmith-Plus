# Build context: ./vue-frontend  (set in compose file)
# highway.js / audio-mixer.js / diagnostics.js are served at runtime
# by the backend via /static/ — this container never needs them.

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/20-resolve-backend.sh /docker-entrypoint.d/20-resolve-backend.sh
RUN chmod +x /docker-entrypoint.d/20-resolve-backend.sh
EXPOSE 80
