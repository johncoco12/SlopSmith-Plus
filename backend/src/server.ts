import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import websocket from "@fastify/websocket";
import path from "node:path";
import { container } from "tsyringe";

import { config } from "./config.js";
import { IStorageServiceToken } from "./container.js";

// Repositories
import { SongRepository } from "./infrastructure/db/SongRepository.js";
import { FavoritesRepository } from "./infrastructure/db/FavoritesRepository.js";
import { LoopRepository } from "./infrastructure/db/LoopRepository.js";
import { ProfileRepository } from "./infrastructure/db/ProfileRepository.js";
import { PermissionGroupRepository } from "./infrastructure/db/PermissionGroupRepository.js";
import { TrackRepository } from "./infrastructure/db/TrackRepository.js";
import { TrackDataRepository } from "./infrastructure/db/TrackDataRepository.js";
import { StemsRepository } from "./infrastructure/db/StemsRepository.js";
import { StemDataRepository } from "./infrastructure/db/StemDataRepository.js";
import { PluginRegistry } from "./infrastructure/plugins/PluginRegistry.js";

// Services
import { LibraryService } from "./services/LibraryService.js";
import { SongService } from "./services/SongService.js";
import { ScannerService } from "./services/ScannerService.js";
import { SettingsService } from "./services/SettingsService.js";
import { LoopService } from "./services/LoopService.js";
import { ProfileService } from "./services/ProfileService.js";
import { PermissionsService } from "./services/PermissionsService.js";
import { ImportService } from "./services/ImportService.js";
import type { StorageService } from "./services/StorageService.js";

// Middleware
import { errorHandler } from "./api/middleware/errorHandler.js";
import { correlationId } from "./api/middleware/correlationId.js";
import { demoMode } from "./api/middleware/demoMode.js";
import { authMiddleware } from "./api/middleware/auth.js";

// Routes
import { libraryRoutes } from "./api/routes/library.js";
import { songRoutes } from "./api/routes/songs.js";
import { favoritesRoutes } from "./api/routes/favorites.js";
import { settingsRoutes } from "./api/routes/settings.js";
import { pluginRoutes } from "./api/routes/plugins.js";
import { audioRoutes } from "./api/routes/audio.js";
import { diagnosticsRoutes } from "./api/routes/diagnostics.js";
import { versionRoutes } from "./api/routes/version.js";
import { profileRoutes } from "./api/routes/profiles.js";
import { permissionRoutes } from "./api/routes/permissions.js";
import { importRoutes } from "./api/routes/imports.js";

// WebSocket handlers
import { highwayWs } from "./api/ws/highway.js";
import { retuneWs } from "./api/ws/retune.js";

// ─── Service instances ───────────────────────────────────────────────────────

const songRepo = new SongRepository();
const favRepo = new FavoritesRepository();
const loopRepo = new LoopRepository();
const profileRepo = new ProfileRepository();
const permissionGroupRepo = new PermissionGroupRepository();
const trackRepo = new TrackRepository();
const trackDataRepo = new TrackDataRepository();
const stemsRepo = new StemsRepository();
const stemDataRepo = new StemDataRepository();
const pluginRegistry = new PluginRegistry();

const storageService = container.resolve(IStorageServiceToken) as StorageService;

const libraryService = new LibraryService(songRepo, favRepo);
const songService = new SongService(songRepo, config);
const scannerService = new ScannerService(songRepo, config);
const settingsService = new SettingsService(config);
const loopService = new LoopService(loopRepo);
const profileService = new ProfileService(profileRepo);
const permissionsService = new PermissionsService(permissionGroupRepo);
const importService = new ImportService(
  songRepo, trackRepo, trackDataRepo, stemsRepo, stemDataRepo,
  storageService, config,
);

pluginRegistry.discover(config.pluginsBuiltinDir, config.pluginsUserDir);

// ─── Fastify instance ─────────────────────────────────────────────────────

export async function buildServer() {
  const fastify = Fastify({
    logger: config.logPretty
      ? { level: config.logLevel, transport: { target: "pino-pretty" } }
      : { level: config.logLevel },
  });

  // ── Decorators (DI via Fastify instance) ──────────────────────────────────
  fastify.decorate("library", libraryService);
  fastify.decorate("songs", songService);
  fastify.decorate("scanner", scannerService);
  fastify.decorate("settings", settingsService);
  fastify.decorate("loops", loopService);
  fastify.decorate("profiles", profileService);
  fastify.decorate("permissions", permissionsService);
  fastify.decorate("imports", importService);
  fastify.decorate("plugins", pluginRegistry);
  fastify.decorate("storage", storageService);

  // ── Core plugins ──────────────────────────────────────────────────────────
  await fastify.register(cors, { origin: true });
  await fastify.register(multipart, { limits: { fileSize: 256 * 1024 * 1024 } });
  await fastify.register(websocket);
  await fastify.register(staticFiles, {
    root: config.staticDir,
    prefix: "/static",
    decorateReply: false,
  });

  // ── Middleware ────────────────────────────────────────────────────────────
  await fastify.register(correlationId);
  await fastify.register(errorHandler);
  await fastify.register(demoMode);
  await fastify.register(authMiddleware);

  // ── HTTP Routes ───────────────────────────────────────────────────────────
  await fastify.register(libraryRoutes);
  await fastify.register(songRoutes);
  await fastify.register(favoritesRoutes);
  await fastify.register(settingsRoutes);
  await fastify.register(pluginRoutes);
  await fastify.register(audioRoutes);
  await fastify.register(diagnosticsRoutes);
  await fastify.register(versionRoutes);
  await fastify.register(profileRoutes);
  await fastify.register(permissionRoutes);
  await fastify.register(importRoutes);

  // ── WebSocket handlers ────────────────────────────────────────────────────
  await fastify.register(highwayWs);
  await fastify.register(retuneWs);

  // ── SPA catch-all — serve index.html for unmatched GET requests ───────────
  const indexPath = path.join(config.staticDir, "index.html");
  fastify.setNotFoundHandler(async (req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/ws")) {
      return reply.sendFile(indexPath);
    }
    return reply.code(404).send({ error: "Not found" });
  });

  return fastify;
}
