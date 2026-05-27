import path from "node:path";
import fs from "node:fs/promises";
import type { FastifyBaseLogger } from "fastify";
import type { PluginModule } from "../../domain/interfaces/plugins/PluginModule.js";
import type { PluginContext } from "../../domain/interfaces/plugins/PluginContext.js";
import type { LoadedPlugin, PluginState, PluginStatus } from "../../domain/models/plugin.js";
import type { PluginRegistry } from "./PluginRegistry.js";
import type { HookSystem } from "./HookSystem.js";
import type { ProviderRegistry } from "./ProviderRegistry.js";
import type { PermissionRegistry } from "./PermissionRegistry.js";
import type { PluginDbFactory } from "./PluginDb.js";
import type { RouteRegistrar } from "./RouteRegistrar.js";
import type { Config } from "../../config.js";

export class PluginLifecycle {
  private readonly state    = new Map<string, PluginState>();
  private readonly modules  = new Map<string, PluginModule>();
  private readonly errors   = new Map<string, string>();
  private readonly disabled = new Set<string>();
  private loadOrder: string[] = [];
  private readonly disabledPath: string;

  constructor(
    private readonly registry: PluginRegistry,
    private readonly hooks: HookSystem,
    private readonly providers: ProviderRegistry,
    private readonly permissions: PermissionRegistry,
    private readonly dbFactory: PluginDbFactory,
    private readonly routeRegistrar: RouteRegistrar,
    private readonly config: Config,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.disabledPath = path.join(config.configDir, "disabled-plugins.json");
  }

  async start(): Promise<void> {
    await this.loadDisabledSet();

    const plugins = this.registry.getAll();
    for (const p of plugins) {
      this.state.set(p.id, this.disabled.has(p.id) ? "disabled" : "discovered");
    }

    this.loadOrder = this.topoSort(plugins);

    for (const id of this.loadOrder) {
      if (this.disabled.has(id)) continue;
      await this.loadOne(id);
    }

    await this.hooks.emit("server:startup");
  }

  async enable(id: string): Promise<void> {
    this.registry.getById(id); // throws if unknown
    if (!this.disabled.has(id)) return;
    this.disabled.delete(id);
    await this.saveDisabledSet();
    // Routes can't be added to a running Fastify instance — caller must restart
  }

  async disable(id: string): Promise<void> {
    this.registry.getById(id); // throws if unknown
    if (this.disabled.has(id)) return;
    await this.teardownOne(id);
    this.disabled.add(id);
    this.state.set(id, "disabled");
    await this.saveDisabledSet();
  }

  isDisabled(id: string): boolean {
    return this.disabled.has(id);
  }

  private async loadDisabledSet(): Promise<void> {
    try {
      const raw = await fs.readFile(this.disabledPath, "utf-8");
      const ids: string[] = JSON.parse(raw);
      for (const id of ids) this.disabled.add(id);
    } catch { /* file doesn't exist yet — all enabled */ }
  }

  private async saveDisabledSet(): Promise<void> {
    try {
      await fs.writeFile(this.disabledPath, JSON.stringify([...this.disabled]), "utf-8");
    } catch (err) {
      this.logger.warn({ err }, "Failed to persist disabled-plugins.json");
    }
  }

  async shutdown(): Promise<void> {
    await this.hooks.emit("server:shutdown");

    for (const id of [...this.loadOrder].reverse()) {
      await this.teardownOne(id);
    }
  }

  getStatus(): PluginStatus[] {
    return this.registry.getAll().map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      state: this.state.get(p.id) ?? "discovered",
      error: this.errors.get(p.id),
    }));
  }

  private async loadOne(id: string): Promise<void> {
    const plugin = this.registry.getById(id);

    try {
      this.state.set(id, "loading");
      const mod = await this.importModule(plugin);

      if (!mod.setup) {
        this.state.set(id, "active");
        return;
      }

      this.state.set(id, "setting_up");
      const ctx = this.buildContext(plugin);
      await mod.setup(ctx);

      this.modules.set(id, mod);
      this.state.set(id, "active");

      await this.hooks.emit("plugin:loaded", { pluginId: id });
      this.logger.info({ pluginId: id }, "Plugin loaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state.set(id, "errored");
      this.errors.set(id, msg);
      this.logger.error({ pluginId: id, err }, "Plugin setup failed");
      await this.hooks.emit("plugin:errored", { pluginId: id, error: msg });
    }
  }

  private async teardownOne(id: string): Promise<void> {
    const mod = this.modules.get(id);
    if (!mod || this.state.get(id) !== "active") return;

    try {
      this.state.set(id, "tearing_down");
      if (mod.teardown) {
        const plugin = this.registry.getById(id);
        await mod.teardown(this.buildContext(plugin));
      }
    } catch (err) {
      this.logger.error({ pluginId: id, err }, "Plugin teardown failed");
    } finally {
      this.hooks.unregisterAll(id);
      this.providers.unregisterAll(id);
      this.permissions.unregisterAll(id);
      this.modules.delete(id);
      this.state.set(id, "disabled");
    }
  }

  private async importModule(plugin: LoadedPlugin): Promise<PluginModule> {
    // `server` is the explicit server-side entry; fall back to `script` for
    // older plugins that used `script` for both browser IIFE and server module.
    const entry = plugin.manifest.server ?? plugin.manifest.script;
    if (!entry) return {};

    const entryPath = path.resolve(plugin.dir, entry);
    try {
      return (await import(entryPath)) as PluginModule;
    } catch {
      return {};
    }
  }

  private buildContext(plugin: LoadedPlugin): PluginContext {
    const pluginId = plugin.id;
    const hooks = this.hooks;
    const providers = this.providers;
    const permissions = this.permissions;
    const db = this.dbFactory.forPlugin(pluginId);
    const routes = this.routeRegistrar.forPlugin(pluginId);
    const logger = this.logger.child({ plugin: pluginId });
    const cfg = this.config;

    return {
      pluginId,
      pluginDir: plugin.dir,
      config: {
        configDir: cfg.configDir,
        pluginsBuiltinDir: cfg.pluginsBuiltinDir,
        pluginsUserDir: cfg.pluginsUserDir,
        version: cfg.version,
        env: process.env.NODE_ENV === "production" ? "production" : "development",
      },
      hooks: {
        on(event, handler, opts) {
          hooks.register(event, pluginId, handler, opts);
        },
        once(event, handler) {
          const wrapper: typeof handler = async (payload) => {
            hooks.unregister(event, pluginId, wrapper);
            return handler(payload);
          };
          hooks.register(event, pluginId, wrapper);
        },
        off(event, handler) {
          hooks.unregister(event, pluginId, handler);
        },
      },
      routes,
      providers: {
        register<T>(type: string, name: string, provider: T) {
          providers.register(type, name, provider, pluginId);
        },
        get<T>(type: string): T | null {
          return providers.get<T>(type);
        },
      },
      permissions: {
        define(name: string, description: string) {
          permissions.define(pluginId, name, description);
        },
      },
      db,
      logger: {
        info: (msg, data) => logger.info(data ?? {}, msg),
        warn: (msg, data) => logger.warn(data ?? {}, msg),
        error: (msg, data) => logger.error(data ?? {}, msg),
      },
    };
  }

  private topoSort(plugins: LoadedPlugin[]): string[] {
    const ids = new Set(plugins.map((p) => p.id));
    const inDegree = new Map<string, number>();
    const edges = new Map<string, string[]>();

    for (const p of plugins) {
      inDegree.set(p.id, 0);
      edges.set(p.id, []);
    }

    for (const p of plugins) {
      for (const dep of p.manifest.dependsOn ?? []) {
        if (!ids.has(dep)) continue;
        edges.get(dep)!.push(p.id);
        inDegree.set(p.id, (inDegree.get(p.id) ?? 0) + 1);
      }
    }

    const queue = [...inDegree.entries()]
      .filter(([, d]) => d === 0)
      .map(([id]) => id);
    const result: string[] = [];

    while (queue.length) {
      const id = queue.shift()!;
      result.push(id);
      for (const child of edges.get(id) ?? []) {
        const newDeg = (inDegree.get(child) ?? 1) - 1;
        inDegree.set(child, newDeg);
        if (newDeg === 0) queue.push(child);
      }
    }

    // Append any plugins not reachable via topo sort (e.g. cycles) at the end
    for (const p of plugins) {
      if (!result.includes(p.id)) result.push(p.id);
    }

    return result;
  }
}
