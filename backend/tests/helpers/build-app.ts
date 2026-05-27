/**
 * Builds a Fastify instance wired with stub services for route-level tests.
 * Each stub can be replaced per-test by passing overrides.
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import type { Session } from "../../src/domain/interfaces/services/IProfileService.js";
import type { IPermissionsService } from "../../src/domain/interfaces/services/IPermissionsService.js";
import { errorHandler } from "../../src/api/middleware/errorHandler.js";
import { libraryRoutes } from "../../src/api/routes/library.js";
import { favoritesRoutes } from "../../src/api/routes/favorites.js";
import { trackRoutes } from "../../src/api/routes/tracks.js";
import { settingsRoutes } from "../../src/api/routes/settings.js";
import { versionRoutes } from "../../src/api/routes/version.js";
import { diagnosticsRoutes } from "../../src/api/routes/diagnostics.js";
import { songRoutes } from "../../src/api/routes/songs.js";
import { pluginRoutes } from "../../src/api/routes/plugins.js";
import { audioRoutes } from "../../src/api/routes/audio.js";
import type { LibraryService } from "../../src/services/LibraryService.js";
import type { ScannerService } from "../../src/services/ScannerService.js";
import type { SettingsService } from "../../src/services/SettingsService.js";
import type { TrackService } from "../../src/services/TrackService.js";
import type { LoopService } from "../../src/services/LoopService.js";
import type { SongService } from "../../src/services/SongService.js";
import type { PluginRegistry } from "../../src/infrastructure/plugins/PluginRegistry.js";

export interface StubOverrides {
  library?: Partial<LibraryService>;
  scanner?: Partial<ScannerService>;
  settings?: Partial<SettingsService>;
  trackSvc?: Partial<TrackService>;
  loops?: Partial<LoopService>;
  songs?: Partial<SongService>;
  plugins?: Partial<PluginRegistry>;
}

const MOCK_SESSION: Session = {
  token: "test-token",
  profileId: 1,
  profileName: "Test",
  createdAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
};

export function buildTestApp(overrides: StubOverrides = {}) {
  const fastify = Fastify({ logger: false });

  fastify.addHook("onRequest", async (req) => {
    req.session = MOCK_SESSION;
  });

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

  const trackSvcStub: TrackService = {
    getTrack: async () => { throw new Error("not implemented"); },
    getTrackData: async () => { throw new Error("not implemented"); },
    getStems: async () => [],
    getCoverArt: async () => null,
    getAudio: async () => null,
    getStemAudio: async () => null,
    getCovers: async () => [],
    getLoops: async () => [],
    addLoop: async (_tid, _pid, _name, st, et) => ({
      id: 1,
      profileId: 1,
      trackId: 1,
      name: "Loop 1",
      startTime: st,
      endTime: et,
      createdAt: new Date(),
    }),
    deleteLoop: async () => {},
    updateTrack: async () => { throw new Error("not implemented"); },
    deleteTrack: async () => {},
    ...overrides.trackSvc,
  } as unknown as TrackService;

  const loopsStub: LoopService = {
    getLoops: async () => [],
    createLoop: async (_tid, _pid, _name, st, et) => ({
      id: 1,
      profileId: 1,
      trackId: 1,
      name: "Loop 1",
      startTime: st,
      endTime: et,
      createdAt: new Date(),
    }),
    deleteLoop: async () => {},
    ...overrides.loops,
  } as unknown as LoopService;

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

  const permissionsStub: IPermissionsService = {
    resolvePermissions: async () => [],
    hasPermission: async () => true,
    hasAnyPermission: async () => true,
    hasAllPermissions: async () => true,
    invalidateCache: () => {},
    listGroups: async () => [],
    getGroup: async () => { throw new Error("not found"); },
    createGroup: async () => { throw new Error("not implemented"); },
    updateGroup: async () => { throw new Error("not implemented"); },
    deleteGroup: async () => {},
    addProfileToGroup: async () => { throw new Error("not implemented"); },
    removeProfileFromGroup: async () => { throw new Error("not implemented"); },
  };

  fastify.decorate("library", libraryStub);
  fastify.decorate("scanner", scannerStub);
  fastify.decorate("settings", settingsStub);
  fastify.decorate("trackSvc", trackSvcStub);
  fastify.decorate("loops", loopsStub);
  fastify.decorate("songs", songsStub);
  fastify.decorate("plugins", pluginsStub);
  fastify.decorate("permissions", permissionsStub);

  fastify.register(cors, { origin: true });
  fastify.register(multipart);
  fastify.register(websocket);
  fastify.register(errorHandler);
  fastify.register(libraryRoutes);
  fastify.register(favoritesRoutes);
  fastify.register(trackRoutes);
  fastify.register(settingsRoutes);
  fastify.register(versionRoutes);
  fastify.register(diagnosticsRoutes);
  fastify.register(songRoutes);
  fastify.register(pluginRoutes);
  fastify.register(audioRoutes);

  return fastify;
}
