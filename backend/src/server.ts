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
  IProfileRepositoryToken,
  ITrackRepositoryToken,
  ITrackDataRepositoryToken,
  IStemsRepositoryToken,
  IStemDataRepositoryToken,
  ILoopRepositoryToken,
  ITrackScoreRepositoryToken,
} from "./tokens.js";

import { SacBeaconService }      from "./services/sac/SacBeaconService.js";
import { SacSessionService }     from "./services/sac/SacSessionService.js";
import { PitchProcessorService } from "./services/sac/PitchProcessorService.js";
import { sacRoutes }             from "./api/routes/sac.js";
import type { IProfileRepository } from "./domain/repositories.js";

import { SongRepository } from "./infrastructure/db/SongRepository.js";
import { FavoritesRepository } from "./infrastructure/db/FavoritesRepository.js";
import { LoopRepository } from "./infrastructure/db/LoopRepository.js";
import { PluginRegistry } from "./infrastructure/plugins/PluginRegistry.js";
import { HookSystem } from "./infrastructure/plugins/HookSystem.js";
import { ProviderRegistry } from "./infrastructure/plugins/ProviderRegistry.js";
import { PermissionRegistry } from "./infrastructure/plugins/PermissionRegistry.js";
import { PluginDbFactory } from "./infrastructure/plugins/PluginDb.js";
import { RouteRegistrar } from "./infrastructure/plugins/RouteRegistrar.js";
import { PluginLifecycle } from "./infrastructure/plugins/PluginLifecycle.js";
import { PluginService } from "./services/PluginService.js";

import { LibraryService } from "./services/LibraryService.js";
import { ScannerService } from "./services/ScannerService.js";
import { SettingsService } from "./services/SettingsService.js";
import { ImportService } from "./services/ImportService.js";
import { TrackService } from "./services/TrackService.js";
import { TrackScoreService } from "./services/TrackScoreService.js";
import { HighwayService } from "./services/HighwayService.js";
import type { StorageService } from "./services/StorageService.js";
import type { IProfileService } from "./domain/interfaces/services/IProfileService.js";
import type { IPermissionsService } from "./domain/interfaces/services/IPermissionsService.js";

import { errorHandler } from "./api/middleware/errorHandler.js";
import { correlationId } from "./api/middleware/correlationId.js";
import { authMiddleware } from "./api/middleware/auth.js";

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

export async function buildServer() {
  const songRepo = new SongRepository();
  const favRepo = new FavoritesRepository();
  const loopRepo = new LoopRepository();
  const pluginRegistry = new PluginRegistry();

  const storageService     = container.resolve(IStorageServiceToken) as StorageService;
  const profileService     = container.resolve(IProfileServiceToken) as IProfileService;
  const permissionsService = container.resolve(IPermissionsServiceToken) as IPermissionsService;
  const profileRepo        = container.resolve(IProfileRepositoryToken) as IProfileRepository;

  // ── SlopAudio-Connect services ─────────────────────────────────────────────
  const sacBeacon  = new SacBeaconService(config.sacServerName, config.sacHttpPort, undefined, undefined, config.sacServerIp);
  const sacSession = new SacSessionService(profileRepo);
  const sacPitch   = new PitchProcessorService(sacSession);

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
    favRepo,
    songRepo,
  );

  const trackScoreService = new TrackScoreService(
    container.resolve(ITrackScoreRepositoryToken),
  );

  const highwayService = new HighwayService(
    container.resolve(ITrackRepositoryToken),
    container.resolve(ITrackDataRepositoryToken),
    config,
  );

  pluginRegistry.discover(config.pluginsBuiltinDir, config.pluginsUserDir);

  const hookSystem = new HookSystem();
  const providerRegistry = new ProviderRegistry();
  const permissionRegistry = new PermissionRegistry();
  const pluginDbFactory = new PluginDbFactory();

  // Core providers — available to all plugins via ctx.providers.get(type)
  providerRegistry.register('trackScores', 'core', {
    getAll: () => trackScoreService.getAll(),
  });

  const fastify = Fastify({
    logger: config.logPretty
      ? { level: config.logLevel, transport: { target: "pino-pretty" } }
      : { level: config.logLevel },
  });

  // RouteRegistrar needs the fastify instance, but start() is called after
  // routes so that plugin-defined routes still register in time.
  const routeRegistrar = new RouteRegistrar(fastify);
  const pluginLifecycle = new PluginLifecycle(
    pluginRegistry,
    hookSystem,
    providerRegistry,
    permissionRegistry,
    pluginDbFactory,
    routeRegistrar,
    config,
    fastify.log,
  );
  const pluginSvc = new PluginService(
    pluginRegistry,
    pluginLifecycle,
    providerRegistry,
    permissionRegistry,
    pluginDbFactory,
  );

  fastify.decorate("library", libraryService);
  fastify.decorate("scanner", scannerService);
  fastify.decorate("settings", settingsService);
  fastify.decorate("profiles", profileService);
  fastify.decorate("permissions", permissionsService);
  fastify.decorate("imports", importService);
  fastify.decorate("trackSvc", trackService);
  fastify.decorate("trackScoreSvc", trackScoreService);
  fastify.decorate("highway", highwayService);
  fastify.decorate("plugins", pluginRegistry);
  fastify.decorate("storage", storageService);
  fastify.decorate("hooks", hookSystem);
  fastify.decorate("providerRegistry", providerRegistry);
  fastify.decorate("permissionRegistry", permissionRegistry);
  fastify.decorate("pluginSvc", pluginSvc);
  fastify.decorate("sacSessionSvc", sacSession);

  await fastify.register(cors, { origin: true });
  await fastify.register(multipart, { limits: { fileSize: 256 * 1024 * 1024 } });
  await fastify.register(websocket);
  await fastify.register(staticFiles, {
    root: [config.staticDir, path.join(config.pluginsBuiltinDir, "static")],
    prefix: "/static",
    decorateReply: false,
  });

  await fastify.register(correlationId);
  await fastify.register(errorHandler);
  await fastify.register(authMiddleware);

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
  await fastify.register(sacRoutes);

  await pluginLifecycle.start();

  sacBeacon.start();
  sacSession.start();
  sacPitch.start();

  fastify.addHook("onClose", async () => {
    await pluginLifecycle.shutdown();
    sacPitch.stop();
    sacSession.stop();
    sacBeacon.stop();
  });

  const indexPath = path.join(config.staticDir, "index.html");
  fastify.setNotFoundHandler(async (req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/ws")) {
      return reply.sendFile(indexPath);
    }
    return reply.code(404).send({ error: "Not found" });
  });

  songRepo.deleteOrphaned()
    .then((n) => { if (n > 0) fastify.log.info(`Purged ${n} orphaned Song row(s)`) })
    .catch((err) => fastify.log.warn({ err }, "Orphan cleanup failed (non-fatal)"));

  return fastify;
}