import type { LibraryService } from "../services/LibraryService.js";
import type { ScannerService } from "../services/ScannerService.js";
import type { SettingsService } from "../services/SettingsService.js";
import type { IProfileService, Session } from "../domain/interfaces/services/IProfileService.js";
import type { IPermissionsService } from "../domain/interfaces/services/IPermissionsService.js";
import type { ImportService } from "../services/ImportService.js";
import type { TrackService } from "../services/TrackService.js";
import type { TrackScoreService } from "../services/TrackScoreService.js";
import type { HighwayService } from "../services/HighwayService.js";
import type { StorageService } from "../services/StorageService.js";
import type { PluginRegistry } from "../infrastructure/plugins/PluginRegistry.js";
import type { PluginService } from "../services/PluginService.js";
import type { HookSystem } from "../infrastructure/plugins/HookSystem.js";
import type { ProviderRegistry } from "../infrastructure/plugins/ProviderRegistry.js";
import type { PermissionRegistry } from "../infrastructure/plugins/PermissionRegistry.js";
import type { SongService } from "../services/SongService.js";
import type { LoopService } from "../services/LoopService.js";
import type { SacSessionService } from "../services/sac/SacSessionService.js";

declare module "fastify" {
  interface FastifyInstance {
    library: LibraryService;
    scanner: ScannerService;
    settings: SettingsService;
    profiles: IProfileService;
    permissions: IPermissionsService;
    imports: ImportService;
    trackSvc: TrackService;
    trackScoreSvc: TrackScoreService;
    highway: HighwayService;
    storage: StorageService;
    plugins: PluginRegistry;
    pluginSvc: PluginService;
    hooks: HookSystem;
    providerRegistry: ProviderRegistry;
    permissionRegistry: PermissionRegistry;
    songs: SongService;
    loops: LoopService;
    sacSessionSvc: SacSessionService;
  }

  interface FastifyRequest {
    session: Session | null;
  }
}