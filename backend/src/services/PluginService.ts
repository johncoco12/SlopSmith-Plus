import type { PluginRegistry } from "../infrastructure/plugins/PluginRegistry.js";
import type { PluginLifecycle } from "../infrastructure/plugins/PluginLifecycle.js";
import type { ProviderRegistry } from "../infrastructure/plugins/ProviderRegistry.js";
import type { PermissionRegistry, PermissionDefinition } from "../infrastructure/plugins/PermissionRegistry.js";
import type { PluginDbFactory } from "../infrastructure/plugins/PluginDb.js";
import type { PluginStatus } from "../domain/models/plugin.js";
import { ALL_PERMISSIONS } from "../domain/models/permission.js";

export interface AvailablePermission {
  readonly name: string;
  readonly description: string;
  readonly pluginId?: string;
}

export class PluginService {
  constructor(
    private readonly registry: PluginRegistry,
    private readonly lifecycle: PluginLifecycle,
    private readonly providers: ProviderRegistry,
    private readonly permissionReg: PermissionRegistry,
    private readonly dbFactory: PluginDbFactory,
  ) {}

  getAll() {
    const statuses = new Map<string, PluginStatus>(
      this.lifecycle.getStatus().map((s) => [s.id, s]),
    );
    return this.registry.getAll().map((p) => this._shape(p, statuses.get(p.id)));
  }

  getById(id: string) {
    const plugin = this.registry.getById(id);
    const status = this.lifecycle.getStatus().find((s) => s.id === id);
    return this._shape(plugin, status);
  }

  private _shape(p: ReturnType<PluginRegistry["getAll"]>[number], status?: PluginStatus) {
    return {
      id: p.id,
      name: p.name,
      version: p.version,
      bundled: p.bundled,
      // Flattened fields the frontend Plugin type expects at the top level
      type: p.manifest.type,
      nav: p.manifest.nav,
      has_settings: p.capabilities.hasSettings,
      has_script: p.capabilities.hasScript,
      script: p.manifest.script,
      component: p.manifest.component,
      capabilities: p.capabilities,
      manifest: p.manifest,
      state: status?.state ?? "discovered",
      error: status?.error,
    };
  }

  listProviders(): { type: string; providers: { name: string; active: boolean }[] }[] {
    return this.providers.listTypes().map((type) => ({
      type,
      providers: this.providers.list(type),
    }));
  }

  setActiveProvider(type: string, name: string): void {
    this.providers.setActive(type, name);
  }

  listAvailablePermissions(): AvailablePermission[] {
    const core: AvailablePermission[] = ALL_PERMISSIONS.map((name) => ({
      name,
      description: `Core permission: ${name}`,
    }));
    const plugin: AvailablePermission[] = this.permissionReg.list().map((d) => ({
      name: d.name,
      description: d.description,
      pluginId: d.pluginId,
    }));
    return [...core, ...plugin];
  }

  async enablePlugin(id: string): Promise<void> {
    await this.lifecycle.enable(id);
  }

  async disablePlugin(id: string): Promise<void> {
    await this.lifecycle.disable(id);
  }

  async purgePluginData(pluginId: string): Promise<void> {
    await this.dbFactory.purgePlugin(pluginId);
  }
}
