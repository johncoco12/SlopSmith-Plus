import type { LibraryService } from "../services/LibraryService.js";
import type { SongService } from "../services/SongService.js";
import type { ScannerService } from "../services/ScannerService.js";
import type { SettingsService } from "../services/SettingsService.js";
import type { LoopService } from "../services/LoopService.js";
import type { PluginRegistry } from "../infrastructure/plugins/PluginRegistry.js";

declare module "fastify" {
  interface FastifyInstance {
    library: LibraryService;
    songs: SongService;
    scanner: ScannerService;
    settings: SettingsService;
    loops: LoopService;
    plugins: PluginRegistry;
  }
}
