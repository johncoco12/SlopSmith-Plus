/**
 * Builds a Fastify instance wired with stub services for route-level tests.
 * Each stub can be replaced per-test by passing overrides.
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { errorHandler } from "../../src/api/middleware/errorHandler.js";
import { libraryRoutes } from "../../src/api/routes/library.js";
import { favoritesRoutes } from "../../src/api/routes/favorites.js";
import { settingsRoutes } from "../../src/api/routes/settings.js";
import { versionRoutes } from "../../src/api/routes/version.js";
import { diagnosticsRoutes } from "../../src/api/routes/diagnostics.js";
import { songRoutes } from "../../src/api/routes/songs.js";
import { pluginRoutes } from "../../src/api/routes/plugins.js";
import { audioRoutes } from "../../src/api/routes/audio.js";
import type { LibraryService } from "../../src/services/LibraryService.js";
import type { ScannerService } from "../../src/services/ScannerService.js";
import type { SettingsService } from "../../src/services/SettingsService.js";
import type { LoopService } from "../../src/services/LoopService.js";
import type { SongService } from "../../src/services/SongService.js";
import type { PluginRegistry } from "../../src/infrastructure/plugins/PluginRegistry.js";

export interface StubOverrides {
  library?: Partial<LibraryService>;
  scanner?: Partial<ScannerService>;
  settings?: Partial<SettingsService>;
  loops?: Partial<LoopService>;
  songs?: Partial<SongService>;
  plugins?: Partial<PluginRegistry>;
}

export function buildTestApp(overrides: StubOverrides = {}) {
  const fastify = Fastify({ logger: false });

  const scannerStub: ScannerService = {
    getStatus: () => ({
      running: false,
      stage: "idle",
      total: 0,
      done: 0,
      current: "",
      isFirstScan: false,
    }),
    scan: async () => {},
    startPeriodicScan: () => {},
    stopPeriodicScan: () => {},
    ...overrides.scanner,
  } as ScannerService;

  const libraryStub: LibraryService = {
    search: async () => ({ items: [], total: 0, page: 1, size: 50 }),
    artists: async () => ({ items: [], total: 0, page: 1, size: 20 }),
    stats: async () => ({ totalSongs: 0, totalArtists: 0, letters: {} }),
    tuningNames: async () => [],
    toggleFavorite: async () => false,
    ...overrides.library,
  } as LibraryService;

  const settingsStub: SettingsService = {
    load: () => ({}),
    save: () => ({}),
    asApiResponse: () => ({
      dlc_dir: "",
      psarc_platform: "both",
      default_arrangement: "Lead",
      master_difficulty: 100,
      av_offset_ms: 0,
      demucs_server_url: "",
    }),
    exportBundle: () => ({ schema: "slopsmith.settings.v1", exported_at: "", server_config: {} }),
    importBundle: () => ({ ok: true, warnings: [] }),
    ...overrides.settings,
  } as SettingsService;

  const loopsStub: LoopService = {
    getForSong: async () => [],
    create: async (_f, _n, st, et) => ({
      id: 1,
      filename: "test.psarc",
      name: "Loop 1",
      startTime: st,
      endTime: et,
      createdAt: new Date(),
    }),
    delete: async () => {},
    ...overrides.loops,
  } as LoopService;

  const songsStub: SongService = {
    getMeta: async () => ({ filename: "song.psarc", title: "Test" }),
    extractSong: async () => {
      throw new Error("not implemented in stub");
    },
    resolveDlcPath: (filename: string) => `/dlc/${filename}`,
    getAudioUrl: () => ({ url: "/audio/song.mp3", error: null }),
    getAlbumArt: () => null,
    saveAlbumArt: () => {},
    deleteSong: async () => {},
    getSloppakFile: () => "/tmp/stems/full.ogg",
    ...overrides.songs,
  } as unknown as SongService;

  const pluginsStub: PluginRegistry = {
    discover: () => {},
    getAll: () => [],
    getById: (id: string) => { throw new Error(`plugin ${id} not found`); },
    resolveFile: () => "/tmp/plugin-file.js",
    ...overrides.plugins,
  } as unknown as PluginRegistry;

  fastify.decorate("library", libraryStub);
  fastify.decorate("scanner", scannerStub);
  fastify.decorate("settings", settingsStub);
  fastify.decorate("loops", loopsStub);
  fastify.decorate("songs", songsStub);
  fastify.decorate("plugins", pluginsStub);

  fastify.register(cors, { origin: true });
  fastify.register(multipart);
  fastify.register(websocket);
  fastify.register(errorHandler);
  fastify.register(libraryRoutes);
  fastify.register(favoritesRoutes);
  fastify.register(settingsRoutes);
  fastify.register(versionRoutes);
  fastify.register(diagnosticsRoutes);
  fastify.register(songRoutes);
  fastify.register(pluginRoutes);
  fastify.register(audioRoutes);

  return fastify;
}
