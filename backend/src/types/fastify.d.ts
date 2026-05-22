import type { LibraryService } from "../services/LibraryService.js";
import type { SongService } from "../services/SongService.js";
import type { ScannerService } from "../services/ScannerService.js";
import type { SettingsService } from "../services/SettingsService.js";
import type { LoopService } from "../services/LoopService.js";
import type { ProfileService, Session } from "../services/ProfileService.js";
import type { PermissionsService } from "../services/PermissionsService.js";
import type { ImportService } from "../services/ImportService.js";
import type { StorageService } from "../services/StorageService.js";
import type { PluginRegistry } from "../infrastructure/plugins/PluginRegistry.js";

declare module "fastify" {
  interface FastifyInstance {
    library: LibraryService;
    songs: SongService;
    scanner: ScannerService;
    settings: SettingsService;
    loops: LoopService;
    profiles: ProfileService;
    permissions: PermissionsService;
    imports: ImportService;
    storage: StorageService;
    plugins: PluginRegistry;
  }

  interface FastifyRequest {
    session: Session | null;
  }
}