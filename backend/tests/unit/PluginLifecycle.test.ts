import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginLifecycle } from "../../src/infrastructure/plugins/PluginLifecycle.js";
import { HookSystem } from "../../src/infrastructure/plugins/HookSystem.js";
import { ProviderRegistry } from "../../src/infrastructure/plugins/ProviderRegistry.js";
import { PermissionRegistry } from "../../src/infrastructure/plugins/PermissionRegistry.js";
import type { PluginRegistry } from "../../src/infrastructure/plugins/PluginRegistry.js";
import type { PluginDbFactory } from "../../src/infrastructure/plugins/PluginDb.js";
import type { RouteRegistrar } from "../../src/infrastructure/plugins/RouteRegistrar.js";
import type { LoadedPlugin } from "../../src/domain/models/plugin.js";
import type { Config } from "../../src/config.js";
import type { FastifyBaseLogger } from "fastify";

// Mock node:fs/promises so loadDisabledSet/saveDisabledSet don't hit the filesystem
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
  readFile:  vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir:     vi.fn().mockResolvedValue(undefined),
}));

function makePlugin(id: string, entry?: string): LoadedPlugin {
  return {
    id,
    name: `Plugin ${id}`,
    version: "1.0.0",
    bundled: true,
    dir: `/plugins/${id}`,
    manifest: {
      id,
      name: `Plugin ${id}`,
      ...(entry ? { server: entry } : {}),
    },
    capabilities: {
      hasScreen: false, hasScript: false,
      hasSettings: false, hasTour: false, hasComponent: false,
    },
  };
}

function makeRegistry(plugins: LoadedPlugin[]): PluginRegistry {
  return {
    discover: () => {},
    getAll: () => plugins,
    getById: (id) => {
      const p = plugins.find((x) => x.id === id);
      if (!p) throw new Error(`Plugin "${id}" not found`);
      return p;
    },
    resolveFile: () => "/tmp/file",
  } as unknown as PluginRegistry;
}

function makeDbFactory(): PluginDbFactory {
  return {
    forPlugin: () => ({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
    }),
    purgePlugin: vi.fn().mockResolvedValue(undefined),
  } as unknown as PluginDbFactory;
}

function makeRouteRegistrar(): RouteRegistrar {
  return {
    forPlugin: () => ({
      register: vi.fn(),
      ws: vi.fn(),
    }),
  } as unknown as RouteRegistrar;
}

const fakeConfig: Config = {
  configDir: "/tmp/config",
  pluginsBuiltinDir: "/tmp/plugins",
} as unknown as Config;

const fakeLogger: FastifyBaseLogger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
  child: () => fakeLogger,
} as unknown as FastifyBaseLogger;

function buildLifecycle(plugins: LoadedPlugin[]) {
  const hooks       = new HookSystem();
  const providers   = new ProviderRegistry();
  const permissions = new PermissionRegistry();
  const registry    = makeRegistry(plugins);
  const dbFactory   = makeDbFactory();
  const routes      = makeRouteRegistrar();

  const lifecycle = new PluginLifecycle(
    registry, hooks, providers, permissions, dbFactory, routes, fakeConfig, fakeLogger,
  );

  return { lifecycle, hooks, providers, permissions };
}

describe("PluginLifecycle", () => {
  describe("getStatus", () => {
    it("returns discovered state for all plugins before start()", () => {
      const { lifecycle } = buildLifecycle([makePlugin("a"), makePlugin("b")]);
      const statuses = lifecycle.getStatus();
      expect(statuses).toHaveLength(2);
      expect(statuses.every((s) => s.state === "discovered")).toBe(true);
    });
  });

  describe("start() with no-setup modules", () => {
    it("marks a plugin with no entry as active", async () => {
      const { lifecycle } = buildLifecycle([makePlugin("no-entry")]);
      // importModule returns {} when there is no entry — plugin becomes active
      vi.spyOn(lifecycle as any, "importModule").mockResolvedValue({});
      await lifecycle.start();
      const s = lifecycle.getStatus().find((x) => x.id === "no-entry")!;
      expect(s.state).toBe("active");
    });

    it("marks a plugin with a setup function as active after setup runs", async () => {
      const setup = vi.fn().mockResolvedValue(undefined);
      const { lifecycle } = buildLifecycle([makePlugin("with-setup", "index.js")]);
      vi.spyOn(lifecycle as any, "importModule").mockResolvedValue({ setup });
      await lifecycle.start();
      expect(setup).toHaveBeenCalledOnce();
      const s = lifecycle.getStatus().find((x) => x.id === "with-setup")!;
      expect(s.state).toBe("active");
    });

    it("emits plugin:loaded after successful load when plugin has a setup function", async () => {
      const { lifecycle, hooks } = buildLifecycle([makePlugin("good", "index.js")]);
      vi.spyOn(lifecycle as any, "importModule").mockResolvedValue({
        setup: vi.fn().mockResolvedValue(undefined),
      });
      const handler = vi.fn();
      hooks.register("plugin:loaded", "_test", handler);
      await lifecycle.start();
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe("start() error handling", () => {
    it("marks a plugin as errored when import throws", async () => {
      const { lifecycle } = buildLifecycle([makePlugin("bad", "index.js")]);
      vi.spyOn(lifecycle as any, "importModule").mockRejectedValue(new Error("Module not found"));
      await lifecycle.start();
      const s = lifecycle.getStatus().find((x) => x.id === "bad")!;
      expect(s.state).toBe("errored");
      expect(s.error).toContain("Module not found");
    });

    it("marks a plugin as errored when setup() throws", async () => {
      const { lifecycle } = buildLifecycle([makePlugin("bad-setup", "index.js")]);
      vi.spyOn(lifecycle as any, "importModule").mockResolvedValue({
        setup: async () => { throw new Error("setup boom"); },
      });
      await lifecycle.start();
      const s = lifecycle.getStatus().find((x) => x.id === "bad-setup")!;
      expect(s.state).toBe("errored");
      expect(s.error).toContain("setup boom");
    });

    it("emits plugin:errored when a plugin fails to load", async () => {
      const { lifecycle, hooks } = buildLifecycle([makePlugin("bad", "index.js")]);
      vi.spyOn(lifecycle as any, "importModule").mockRejectedValue(new Error("boom"));
      const handler = vi.fn();
      hooks.register("plugin:errored", "_test", handler);
      await lifecycle.start();
      expect(handler).toHaveBeenCalledOnce();
    });

    it("continues loading other plugins when one fails", async () => {
      const plugins = [makePlugin("bad", "index.js"), makePlugin("good")];
      const { lifecycle } = buildLifecycle(plugins);
      vi.spyOn(lifecycle as any, "importModule")
        .mockRejectedValueOnce(new Error("bad module"))
        .mockResolvedValueOnce({});
      await lifecycle.start();
      expect(lifecycle.getStatus().find((s) => s.id === "bad")?.state).toBe("errored");
      expect(lifecycle.getStatus().find((s) => s.id === "good")?.state).toBe("active");
    });
  });

  describe("disable / enable", () => {
    it("marks a plugin as disabled", async () => {
      const { lifecycle } = buildLifecycle([makePlugin("p")]);
      vi.spyOn(lifecycle as any, "importModule").mockResolvedValue({});
      await lifecycle.start();
      await lifecycle.disable("p");
      expect(lifecycle.getStatus().find((s) => s.id === "p")?.state).toBe("disabled");
      expect(lifecycle.isDisabled("p")).toBe(true);
    });

    it("calls teardown when disabling an active plugin that has one", async () => {
      const teardown = vi.fn().mockResolvedValue(undefined);
      const { lifecycle } = buildLifecycle([makePlugin("p", "index.js")]);
      // Plugin must have setup so its module is stored and teardown becomes reachable
      vi.spyOn(lifecycle as any, "importModule").mockResolvedValue({
        setup: vi.fn().mockResolvedValue(undefined),
        teardown,
      });
      await lifecycle.start();
      await lifecycle.disable("p");
      expect(teardown).toHaveBeenCalledOnce();
    });

    it("enable removes the plugin from the disabled set", async () => {
      const { lifecycle } = buildLifecycle([makePlugin("p")]);
      vi.spyOn(lifecycle as any, "importModule").mockResolvedValue({});
      await lifecycle.start();
      await lifecycle.disable("p");
      expect(lifecycle.isDisabled("p")).toBe(true);
      await lifecycle.enable("p");
      expect(lifecycle.isDisabled("p")).toBe(false);
    });

    it("throws when disabling an unknown plugin id", async () => {
      const { lifecycle } = buildLifecycle([]);
      await lifecycle.start();
      await expect(lifecycle.disable("nope")).rejects.toThrow();
    });
  });

  describe("shutdown", () => {
    it("emits server:shutdown and tears down active plugins", async () => {
      const teardown = vi.fn().mockResolvedValue(undefined);
      const { lifecycle, hooks } = buildLifecycle([makePlugin("p", "index.js")]);
      vi.spyOn(lifecycle as any, "importModule").mockResolvedValue({
        setup: vi.fn().mockResolvedValue(undefined),
        teardown,
      });
      await lifecycle.start();
      const shutdownHandler = vi.fn();
      hooks.register("server:shutdown", "_test", shutdownHandler);
      await lifecycle.shutdown();
      expect(shutdownHandler).toHaveBeenCalledOnce();
      expect(teardown).toHaveBeenCalledOnce();
    });
  });
});
