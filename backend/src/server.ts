import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import websocket from "@fastify/websocket";
import path from "node:path";
import { container } from "tsyringe";

import { config } from "./config.js";
import {
  IStorageServiceToken,
  IProfileServiceToken,
  IPermissionsServiceToken,
  ITrackRepositoryToken,
  ITrackDataRepositoryToken,
  IStemsRepositoryToken,
  IStemDataRepositoryToken,
  ILoopRepositoryToken,
} from "./tokens.js";

// Repositories
import { SongRepository } from "./infrastructure/db/SongRepository.js";
import { FavoritesRepository } from "./infrastructure/db/FavoritesRepository.js";
import { LoopRepository } from "./infrastructure/db/LoopRepository.js";
import { PluginRegistry } from "./infrastructure/plugins/PluginRegistry.js";

// Services
import { LibraryService } from "./services/LibraryService.js";
import { ScannerService } from "./services/ScannerService.js";
import { SettingsService } from "./services/SettingsService.js";
import { ImportService } from "./services/ImportService.js";
import { TrackService } from "./services/TrackService.js";
import { HighwayService } from "./services/HighwayService.js";
import type { StorageService } from "./services/StorageService.js";
import type { IProfileService } from "./domain/interfaces/services/IProfileService.js";
import type { IPermissionsService } from "./domain/interfaces/services/IPermissionsService.js";

// Middleware
import { errorHandler } from "./api/middleware/errorHandler.js";
import { correlationId } from "./api/middleware/correlationId.js";
// import { demoMode } from "./api/middleware/demoMode.js";
import { authMiddleware } from "./api/middleware/auth.js";

// Routes
import { libraryRoutes } from "./api/routes/library.js";
import { favoritesRoutes } from "./api/routes/favorites.js";
import { settingsRoutes } from "./api/routes/settings.js";
import { pluginRoutes } from "./api/routes/plugins.js";
import { audioRoutes } from "./api/routes/audio.js";
import { diagnosticsRoutes } from "./api/routes/diagnostics.js";
import { versionRoutes } from "./api/routes/version.js";
import { profileRoutes } from "./api/routes/profiles.js";
import { permissionRoutes } from "./api/routes/permissions.js";
import { importRoutes } from "./api/routes/imports.js";
import { trackRoutes } from "./api/routes/tracks.js";
import { highwayRoutes } from "./api/routes/highway.js";
import { setupRoutes } from "./api/routes/setup.js";

// WebSocket handlers (TODO: implement stubs)
// import { highwayWs } from "./api/ws/highway.js";
// import { retuneWs } from "./api/ws/retune.js";

export async function buildServer() {
  // ─── Service instances (resolve after DI container is registered) ──────────
  const songRepo = new SongRepository();
  const favRepo = new FavoritesRepository();
  const loopRepo = new LoopRepository();
  const pluginRegistry = new PluginRegistry();

  const storageService = container.resolve(IStorageServiceToken) as StorageService;
  const profileService = container.resolve(IProfileServiceToken) as IProfileService;
  const permissionsService = container.resolve(IPermissionsServiceToken) as IPermissionsService;

  const libraryService = new LibraryService(songRepo, favRepo);
  const settingsService = new SettingsService(config);
  const importService = new ImportService(
    songRepo, container.resolve(ITrackRepositoryToken),
    container.resolve(ITrackDataRepositoryToken),
    container.resolve(IStemsRepositoryToken),
    container.resolve(IStemDataRepositoryToken),
    storageService, config,
  );
  const scannerService = new ScannerService(importService, config);
  const trackService = new TrackService(
    container.resolve(ITrackRepositoryToken),
    container.resolve(ITrackDataRepositoryToken),
    container.resolve(IStemsRepositoryToken),
    container.resolve(IStemDataRepositoryToken),
    container.resolve(ILoopRepositoryToken),
    storageService,
  );

  const highwayService = new HighwayService(
    container.resolve(ITrackRepositoryToken),
    container.resolve(ITrackDataRepositoryToken),
    config,
  );

  pluginRegistry.discover(config.pluginsBuiltinDir, config.pluginsUserDir);

  const fastify = Fastify({
    logger: config.logPretty
      ? { level: config.logLevel, transport: { target: "pino-pretty" } }
      : { level: config.logLevel },
  });

  // ── Decorators (DI via Fastify instance) ──────────────────────────────────
  fastify.decorate("library", libraryService);
  fastify.decorate("scanner", scannerService);
  fastify.decorate("settings", settingsService);
  fastify.decorate("profiles", profileService);
  fastify.decorate("permissions", permissionsService);
  fastify.decorate("imports", importService);
  fastify.decorate("trackSvc", trackService);
  fastify.decorate("highway", highwayService);
  fastify.decorate("plugins", pluginRegistry);
  fastify.decorate("storage", storageService);

  // ── Core plugins ──────────────────────────────────────────────────────────
  await fastify.register(cors, { origin: true });
  await fastify.register(multipart, { limits: { fileSize: 256 * 1024 * 1024 } });
  await fastify.register(websocket);
  await fastify.register(staticFiles, {
    root: [config.staticDir, path.join(config.pluginsBuiltinDir, "static")],
    prefix: "/static",
    decorateReply: false,
  });

  // ── Middleware ────────────────────────────────────────────────────────────
  await fastify.register(correlationId);
  await fastify.register(errorHandler);
  // await fastify.register(demoMode);
  await fastify.register(authMiddleware);

  // ── HTTP Routes ───────────────────────────────────────────────────────────
  await fastify.register(libraryRoutes);
  await fastify.register(favoritesRoutes);
  await fastify.register(settingsRoutes);
  await fastify.register(pluginRoutes);
  await fastify.register(audioRoutes);
  await fastify.register(diagnosticsRoutes);
  await fastify.register(versionRoutes);
  await fastify.register(profileRoutes);
  await fastify.register(permissionRoutes);
  await fastify.register(importRoutes);
  await fastify.register(trackRoutes);
  await fastify.register(highwayRoutes);
  await fastify.register(setupRoutes);

  // ── WebSocket handlers ────────────────────────────────────────────────────
  // await fastify.register(highwayWs);
  // await fastify.register(retuneWs);

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