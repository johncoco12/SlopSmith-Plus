# SlopSmith Plugin Architecture

## Table of Contents

1. [Overview](#overview)
2. [Plugin Manifest Schema](#1-plugin-manifest-schema)
3. [Plugin Lifecycle](#2-plugin-lifecycle)
4. [Host API / Plugin Context](#3-host-api--plugin-context)
5. [Hook System](#4-hook-system)
6. [Provider Registry](#5-provider-registry)
7. [Frontend Plugin Loader](#6-frontend-plugin-loader)
8. [AI Agent Integration](#7-ai-agent-integration)
9. [Project Structure](#8-project-structure)
10. [Migration Path](#9-migration-path)

---

## Overview

SlopSmith is a music game platform with a Fastify (Node.js) backend and Vue 3 frontend. Plugins extend both sides: they can register HTTP/WS routes, provide UI screens and settings panels, contribute implementations of provider interfaces (storage, metadata), and participate in lifecycle hooks. The architecture must be safe (plugin failure must not crash the host), typed (full TypeScript contracts), and extensible (future provider types, AI agents, new UI slots).

### Design Principles

- **Isolation**: Plugin code runs in a sandboxed context. A throwing plugin hook is caught and logged, never propagated to the host.
- **Typed contracts**: All hooks, providers, and frontend slots are defined as TypeScript interfaces. Plugins receive a typed context object; the host receives typed registrations.
- **Declerative manifest, imperative setup**: The `plugin.json` manifest declares *what* a plugin provides. The plugin's `setup()` function imperatively registers hooks, routes, and providers at runtime.
- **Coexistence with Python routes**: Existing Python route modules (e.g. `highway_3d/routes.py`) are migrated to TypeScript setup functions but can run alongside the legacy Python bridge during transition.
- **Frontend dynamic loading**: Plugin UI assets are served from the plugin directory and loaded on demand — no build-time bundling.

---

## 1. Plugin Manifest Schema

The manifest lives at `<pluginDir>/plugin.json` and is the single source of truth for plugin discovery.

### Backend TypeScript interfaces

```typescript
// backend/src/domain/models/plugin.ts

// ── Capability declarations (what the plugin provides) ──────────────────

export interface PluginHookDecl {
  readonly event: string;        // e.g. "song:load", "note:hit"
  readonly phase?: "before" | "after";  // default "after"
}

export interface PluginRouteDecl {
  readonly method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  readonly path: string;        // relative to /api/plugins/{id}/
  readonly handler: string;     // exported function name from the script module
}

export interface PluginProviderDecl {
  readonly type: "storage" | "metadata" | string;  // extensible
  readonly name: string;         // e.g. "localStorage", "musicbrainz"
  readonly factory: string;     // exported function name from the script module
}

export interface PluginWSDDecl {
  readonly path: string;         // relative to /ws/plugins/{id}/
  readonly handler: string;
}

// ── UI slot declarations (consumed by frontend) ────────────────────────

export interface PluginNav {
  readonly label: string;
  readonly screen?: string;
  readonly section?: string;
  readonly icon?: string;
}

export interface PluginSettings {
  readonly html?: string;
  readonly server_files?: readonly string[];
}

export interface PluginTour {
  readonly file: string;
  readonly target?: string;
}

export interface PluginDiagnostics {
  readonly server_files?: readonly string[];
  readonly callable?: string;
}

// ── Top-level manifest ─────────────────────────────────────────────────

export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly type?: string;                       // e.g. "visualization", "tuner", "agent"
  readonly private?: boolean;
  readonly bundled?: boolean;

  // Backend entry point
  readonly script?: string;                    // TS/JS module path (e.g. "index.ts")
  readonly routes?: readonly PluginRouteDecl[];
  readonly ws?: readonly PluginWSDDecl[];
  readonly hooks?: readonly PluginHookDecl[];
  readonly providers?: readonly PluginProviderDecl[];

  // Frontend assets
  readonly nav?: PluginNav;
  readonly screen?: string;                    // HTML served for the plugin view
  readonly component?: string;                 // Vue SFC path for dynamic import
  readonly settings?: PluginSettings;
  readonly tour?: string | PluginTour;
  readonly diagnostics?: PluginDiagnostics;

  // Dependency ordering
  readonly dependsOn?: readonly string[];      // plugin IDs that must load first
}

// ── Runtime model ──────────────────────────────────────────────────────

export interface PluginCapabilities {
  readonly hasScreen: boolean;
  readonly hasScript: boolean;
  readonly hasSettings: boolean;
  readonly hasTour: boolean;
  readonly hasComponent: boolean;
  readonly hasRoutes: boolean;
  readonly hasWS: boolean;
  readonly hasHooks: boolean;
  readonly hasProviders: boolean;
}

export interface LoadedPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly bundled: boolean;
  readonly dir: string;
  readonly manifest: PluginManifest;
  readonly capabilities: PluginCapabilities;
  readonly state: PluginState;
  readonly module?: PluginModule;       // set after successful setup
  readonly error?: string;              // set after failed setup
}

export type PluginState =
  | "discovered"
  | "validating"
  | "loading"
  | "setting_up"
  | "active"
  | "errored"
  | "tearing_down"
  | "disabled";
```

### Manifest JSON example (highway_3d, migrated)

```json
{
  "id": "highway_3d",
  "name": "3D Highway",
  "version": "3.18.0",
  "type": "visualization",
  "bundled": true,
  "description": "3D fretboard visualization renderer",
  "script": "index.ts",
  "routes": [
    { "method": "POST", "path": "files", "handler": "uploadFile" },
    { "method": "GET",  "path": "files/:filename", "handler": "getFile" },
    { "method": "DELETE","path": "files", "handler": "deleteFiles" },
    { "method": "POST", "path": "headstock", "handler": "uploadHeadstock" },
    { "method": "GET",  "path": "headstock/:filename", "handler": "getHeadstock" },
    { "method": "DELETE","path": "headstock", "handler": "deleteHeadstock" }
  ],
  "hooks": [
    { "event": "song:play", "phase": "after" }
  ],
  "nav": { "label": "3D Highway", "screen": "screen.html" },
  "component": "HighwayPlugin.vue",
  "settings": { "html": "settings.html", "server_files": ["plugin_uploads/highway_3d/current.mp4"] },
  "tour": "tour.json"
}
```

### Manifest JSON example (storage provider plugin)

```json
{
  "id": "storage_s3",
  "name": "S3 Storage",
  "version": "1.0.0",
  "type": "provider",
  "script": "index.ts",
  "providers": [
    { "type": "storage", "name": "s3", "factory": "createS3Storage" }
  ],
  "settings": { "html": "settings.html" }
}
```

---

## 2. Plugin Lifecycle

```
 ┌────────────┐
 │ Discover    │  Scan builtin + user dirs for plugin.json manifests
 └─────┬──────┘
       │
 ┌─────▼──────┐
 │ Validate    │  Schema check, dependency resolution, conflict detection
 └─────┬──────┘
       │
 ┌─────▼──────┐
 │ Load        │  Import script module (dynamic ESM import), check exports
 └─────┬──────┘
       │
 ┌─────▼──────┐
 │ Setup       │  Call plugin.setup(ctx) — registers hooks, routes, providers
 └─────┬──────┘
       │
 ┌─────▼──────┐
 │ Active      │  Plugin is live; hooks fire, routes serve, providers available
 └─────┬──────┘
       │
 ┌─────▼──────┐
 │ Teardown    │  Call plugin.teardown(ctx) — cleanup resources, unregister
 └─────────────┘
```

### Lifecycle manager

```typescript
// backend/src/infrastructure/plugins/PluginLifecycle.ts

export class PluginLifecycle {
  private registry: PluginRegistry;
  private logger: Logger;
  private order: string[] = [];         // topological load order
  private modules: Map<string, PluginModule> = new Map();

  constructor(registry: PluginRegistry, logger: Logger) {
    this.registry = registry;
    this.logger = logger;
  }

  async start(): Promise<void> {
    const plugins = this.registry.getAll();
    this.order = this.topoSort(plugins);
    for (const id of this.order) {
      await this.loadAndSetup(id);
    }
  }

  private async loadAndSetup(id: string): Promise<void> {
    const plugin = this.registry.getById(id);
    try {
      plugin.state = "loading";
      const mod = await this.importModule(plugin);
      this.modules.set(id, mod);
      plugin.module = mod;

      plugin.state = "setting_up";
      const ctx = this.createContext(plugin);
      if (mod.setup) {
        await mod.setup(ctx);
      }

      plugin.state = "active";
    } catch (err) {
      plugin.state = "errored";
      plugin.error = err instanceof Error ? err.message : String(err);
      this.logger.error({ plugin: id, err }, "Plugin setup failed");
    }
  }

  private async importModule(plugin: LoadedPlugin): Promise<PluginModule> {
    if (!plugin.capabilities.hasScript || !plugin.manifest.script) {
      return {};
    }
    const entryPath = path.resolve(plugin.dir, plugin.manifest.script);
    // Dynamic import — compiled JS for production, tsx loader in dev
    return import(entryPath) as Promise<PluginModule>;
  }

  async shutdown(): Promise<void> {
    for (const id of [...this.order].reverse()) {
      await this.teardownPlugin(id);
    }
  }

  private async teardownPlugin(id: string): Promise<void> {
    const plugin = this.registry.getById(id);
    const mod = this.modules.get(id);
    if (!mod || plugin.state !== "active") return;

    try {
      plugin.state = "tearing_down";
      if (mod.teardown) {
        await mod.teardown(this.createContext(plugin));
      }
    } catch (err) {
      this.logger.error({ plugin: id, err }, "Plugin teardown failed");
    } finally {
      plugin.state = "disabled";
      this.modules.delete(id);
      plugin.module = undefined;
    }
  }

  private topoSort(plugins: LoadedPlugin[]): string[] {
    // Kahn's algorithm over plugin dependsOn edges
    const ids = new Set(plugins.map(p => p.id));
    const inDegree: Map<string, number> = new Map();
    const edges: Map<string, string[]> = new Map();

    for (const p of plugins) {
      inDegree.set(p.id, 0);
      edges.set(p.id, []);
    }
    for (const p of plugins) {
      for (const dep of p.manifest.dependsOn ?? []) {
        if (ids.has(dep)) {
          edges.get(dep)!.push(p.id);
          inDegree.set(p.id, (inDegree.get(p.id) ?? 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

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
    return result;
  }
}
```

### Module import strategy

In production, plugin scripts are compiled to JS. The `script` field in the manifest points to the JS entry. In development, a `tsx`-compatible loader handles `.ts` files directly. The import path is resolved relative to the plugin directory, so plugins are self-contained.

For safety, the dynamic `import()` is wrapped in a try/catch and the loaded module is validated against the `PluginModule` interface before calling `setup`.

---

## 3. Host API / Plugin Context

Each plugin's `setup()` function receives a **PluginContext** — a scoped handle to the host API surface. The context is the *only* way a plugin interacts with the rest of the system.

```typescript
// backend/src/domain/interfaces/plugins/PluginContext.ts

export interface PluginContext {
  readonly pluginId: string;
  readonly pluginDir: string;
  readonly config: Readonly<PluginConfig>;

  // ── Hook registration ─────────────────────────────────────────────────
  hooks: {
    on(event: string, handler: HookHandler, options?: HookOptions): void;
    once(event: string, handler: HookHandler): void;
    off(event: string, handler: HookHandler): void;
  };

  // ── Route registration ────────────────────────────────────────────────
  routes: {
    /** Register an HTTP route. Path is relative to /api/plugins/{pluginId}/ */
    register(method: string, path: string, handler: RouteHandler): void;
    /** Register a WebSocket endpoint. Path is relative to /ws/plugins/{pluginId}/ */
    ws(path: string, handler: WSHandler): void;
  };

  // ── Provider registration ────────────────────────────────────────────
  providers: {
    register<T extends ProviderType>(type: T, name: string, provider: ProviderFor<T>): void;
  };

  // ── Logging ──────────────────────────────────────────────────────────
  logger: {
    info(msg: string, data?: Record<string, unknown>): void;
    warn(msg: string, data?: Record<string, unknown>): void;
    error(msg: string, data?: Record<string, unknown>): void;
  };

  // ── Storage ──────────────────────────────────────────────────────────
  storage: {
    /** Plugin-scoped key-value store (backed by configDir/plugins/{pluginId}/) */
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

export interface PluginConfig {
  readonly configDir: string;
  readonly pluginsBuiltinDir: string;
  readonly pluginsUserDir: string;
  readonly version: string;
  readonly env: "development" | "production";
}

export interface HookOptions {
  readonly phase?: "before" | "after";
  readonly priority?: number;     // lower runs first; default 100
}

export type HookHandler = (payload: HookPayload) => Promise<HookResult | void> | HookResult | void;

export interface HookPayload {
  readonly event: string;
  readonly data: Record<string, unknown>;
  readonly timestamp: number;
  abort(): void;                   // signal the host to abort the operation
}

export interface HookResult {
  readonly data?: Record<string, unknown>;  // mutations to merge back
}

export type RouteHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<unknown> | unknown;

export type WSHandler = (
  socket: WebSocket,
  request: FastifyRequest,
) => Promise<void> | void;
```

### Scoped access

The context is intentionally narrow:

- **No direct Fastify instance**: plugins use `ctx.routes.register()` not `fastify.register()`. This lets the host prefix, validate, and scope routes.
- **No direct database access**: plugins use `ctx.storage` for their own key-value data, or register providers that the core services then consume.
- **No cross-plugin imports**: plugins communicate through the hook/event system, not direct module references.
- **Logger is namespaced**: all log output is tagged `[plugin:{pluginId}]`.

---

## 4. Hook System

The hook system is a typed, async, ordered event pipeline that runs on the backend. Hooks are the primary way plugins react to and influence core operations.

### Hook types and payloads

```typescript
// backend/src/infrastructure/plugins/HookSystem.ts

export type HookEvent =
  // ── Song lifecycle ────────────────────────────────────────────
  | "song:load"
  | "song:play"
  | "song:pause"
  | "song:stop"
  | "song:end"
  // ── Note events ──────────────────────────────────────────────
  | "note:hit"
  | "note:miss"
  | "note:sustain"
  // ── Library ──────────────────────────────────────────────────
  | "library:scan:start"
  | "library:scan:complete"
  | "library:song:added"
  | "library:song:removed"
  // ── System ──────────────────────────────────────────────────
  | "server:startup"
  | "server:shutdown"
  | "plugin:loaded"
  // ── Extensible ──────────────────────────────────────────────
  | (string & {});   // allow plugins to define custom events

export interface HookPayload {
  readonly event: string;
  readonly data: Record<string, unknown>;
  readonly timestamp: number;
  abort(): void;
}

export interface HookResult {
  readonly data?: Record<string, unknown>;
}

export interface HookEntry {
  readonly pluginId: string;
  readonly handler: HookHandler;
  readonly phase: "before" | "after";
  readonly priority: number;
}

export class HookSystem {
  private hooks: Map<string, HookEntry[]> = new Map();

  register(
    event: string,
    pluginId: string,
    handler: HookHandler,
    options?: HookOptions,
  ): void {
    const entry: HookEntry = {
      pluginId,
      handler,
      phase: options?.phase ?? "after",
      priority: options?.priority ?? 100,
    };
    const list = this.hooks.get(event) ?? [];
    list.push(entry);
    list.sort((a, b) => a.priority - b.priority);
    this.hooks.set(event, list);
  }

  async emit(event: string, data: Record<string, unknown> = {}): Promise<HookPayload> {
    const payload: HookPayload = {
      event,
      data,
      timestamp: Date.now(),
      aborted: false,
      abort() { this.aborted = true; },
    } as HookPayload & { aborted: boolean };

    const entries = this.hooks.get(event) ?? [];

    // Run "before" hooks first
    for (const entry of entries.filter(e => e.phase === "before")) {
      try {
        const result = await entry.handler(payload);
        if (result?.data) {
          Object.assign(payload.data, result.data);
        }
      } catch (err) {
        console.error(`[hooks] ${event} handler from ${entry.pluginId} threw:`, err);
      }
      if ((payload as HookPayload & { aborted: boolean }).aborted) break;
    }

    // Run "after" hooks
    for (const entry of entries.filter(e => e.phase === "after")) {
      try {
        const result = await entry.handler(payload);
        if (result?.data) {
          Object.assign(payload.data, result.data);
        }
      } catch (err) {
        console.error(`[hooks] ${event} handler from ${entry.pluginId} threw:`, err);
      }
      if ((payload as HookPayload & { aborted: boolean }).aborted) break;
    }

    return payload;
  }

  unregisterAll(pluginId: string): void {
    for (const [event, entries] of this.hooks.entries()) {
      this.hooks.set(event, entries.filter(e => e.pluginId !== pluginId));
    }
  }
}
```

### Hook invocation from core

Core services emit hooks at well-defined points:

```typescript
// Example: in SongService
async extractSong(filename: string): Promise<ExtractedSong> {
  const payload = await this.hooks.emit("song:load", { filename });
  if ((payload as any).aborted) throw new Error("Song load aborted by plugin");
  // ... proceed with extraction
  await this.hooks.emit("song:play", { filename, songInfo });
  return result;
}
```

### Frontend event bus

On the frontend, the existing `window.slopsmith` EventTarget-based bus is formalized with typed events:

```typescript
// frontend/src/plugins/PluginEventBus.ts

export type FrontendPluginEvent =
  | { type: "song:ready"; detail: SongInfo }
  | { type: "song:play"; detail: { filename: string } }
  | { type: "song:pause"; detail: { filename: string } }
  | { type: "note:hit"; detail: { fret: number; string: number; time: number } }
  | { type: "plugins:ready"; detail: Record<string, unknown> }
  | { type: "plugin:register"; detail: { id: string; capabilities: PluginCapabilities } }
  | { type: string; detail?: unknown };

export class PluginEventBus {
  private bus: EventTarget = new EventTarget();

  emit(event: string, detail?: unknown): void {
    this.bus.dispatchEvent(new CustomEvent(event, { detail }));
  }

  on(event: string, handler: (detail: unknown) => void): () => void {
    const wrapper = (e: Event) => handler((e as CustomEvent).detail);
    this.bus.addEventListener(event, wrapper);
    return () => this.bus.removeEventListener(event, wrapper);
  }

  once(event: string, handler: (detail: unknown) => void): void {
    const wrapper = (e: Event) => handler((e as CustomEvent).detail);
    this.bus.addEventListener(event, wrapper, { once: true });
  }
}
```

This replaces the current loose `window.slopsmith` pattern while remaining backward-compatible — the existing `window.slopsmith.emit()` calls keep working through a thin adapter:

```typescript
// frontend/src/plugins/legacyAdapter.ts
export function installLegacyAdapter(bus: PluginEventBus): void {
  window.slopsmith = {
    ...window.slopsmith,
    emit(event: string, detail?: unknown) { bus.emit(event, detail); },
    on(event: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions) {
      bus.on(event, (d) => (fn as EventListener)(new CustomEvent(event, { detail: d })));
    },
    off() { /* best-effort */ },
  } as SlopsmithBus;
}
```

---

## 5. Provider Registry

Providers are implementations of named interfaces that the core system discovers and uses. Current providers: `IStorageProvider`, `IMetadataProvider`. The registry is extensible — any plugin can define a new provider type string.

### Provider registry

```typescript
// backend/src/infrastructure/plugins/ProviderRegistry.ts

export type ProviderType = string;

export class ProviderRegistry {
  // Map<type, Map<name, provider>>
  private providers: Map<ProviderType, Map<string, unknown>> = new Map();
  private active: Map<ProviderType, string> = new Map();

  register<T>(type: ProviderType, name: string, provider: T): void {
    if (!this.providers.has(type)) {
      this.providers.set(type, new Map());
    }
    this.providers.get(type)!.set(name, provider);
    // First registered provider of each type becomes the active one
    if (!this.active.has(type)) {
      this.active.set(type, name);
    }
  }

  get<T>(type: ProviderType): T | null {
    const name = this.active.get(type);
    if (!name) return null;
    return this.providers.get(type)?.get(name) as T ?? null;
  }

  getByName<T>(type: ProviderType, name: string): T | null {
    return this.providers.get(type)?.get(name) as T ?? null;
  }

  setActive(type: ProviderType, name: string): void {
    if (!this.providers.get(type)?.has(name)) {
      throw new Error(`Provider "${name}" not registered for type "${type}"`);
    }
    this.active.set(type, name);
  }

  list(type: ProviderType): { name: string; description?: string }[] {
    const map = this.providers.get(type);
    if (!map) return [];
    return [...map.entries()].map(([name, p]) => ({
      name,
      description: (p as any).description,
    }));
  }

  unregisterAll(pluginId: string): void {
    // Called during plugin teardown — providers are tagged with pluginId
    // This is handled via PluginContext tracking, not shown here for brevity
  }
}
```

### Typed provider lookups

```typescript
// backend/src/domain/interfaces/providers/index.ts

export { IStorageProvider, StoredItem } from "./IStorageProvider.js";
export { IMetadataProvider, MetadataLookup, EnrichedMetadata } from "./IMetadataProvider.js";

// Convenience type map for type-safe provider lookups
export interface ProviderMap {
  storage: IStorageProvider;
  metadata: IMetadataProvider;
  // Future: transcription: ITranscriptionProvider;
  // Future: ai_agent: IAgentProvider;
}

export type ProviderType = keyof ProviderMap | string;
```

### StorageService migration

```typescript
// backend/src/services/StorageService.ts (migrated)

export class StorageService {
  private provider: IStorageProvider | null = null;

  constructor(private providerRegistry: ProviderRegistry) {
    this.provider = providerRegistry.get<IStorageProvider>("storage");
  }

  setProvider(name: string): void {
    const p = this.providerRegistry.getByName<IStorageProvider>("storage", name);
    if (!p) throw new Error(`Storage provider "${name}" not found`);
    this.provider = p;
  }

  async store(identifier: string, data: Buffer): Promise<StoredItem> {
    if (!this.provider) throw new Error("No storage provider configured");
    return this.provider.store(identifier, data);
  }

  // ... delegates to provider
}
```

### Plugin registration example (S3 storage)

```typescript
// plugins/storage_s3/index.ts

import type { PluginModule, PluginContext } from "../../domain/interfaces/plugins/index.js";
import type { IStorageProvider, StoredItem } from "../../domain/interfaces/providers/IStorageProvider.js";

class S3StorageProvider implements IStorageProvider {
  readonly name = "s3";
  readonly description = "Amazon S3 storage backend";

  constructor(private ctx: PluginContext) {}

  async store(identifier: string, data: Buffer): Promise<StoredItem> {
    // S3 upload logic using ctx.config
    // ...
  }
  async storeFromPath(identifier: string, sourcePath: string): Promise<StoredItem> { /* ... */ }
  async get(identifier: string): Promise<StoredItem | null> { /* ... */ }
  async delete(identifier: string): Promise<void> { /* ... */ }
}

export const setup = (ctx: PluginContext): void => {
  ctx.providers.register("storage", "s3", new S3StorageProvider(ctx));
};

export default { setup } satisfies PluginModule;
```

---

## 6. Frontend Plugin Loader

### Architecture

The frontend loads plugins in two modes:

1. **Script mode** (current): plugin declares `script` field. The script is loaded via `<script>` tag and registers a global (`window.slopsmithViz_{id}`) that the host calls (this is how `highway_3d` works today).

2. **Component mode** (new): plugin declares `component` field pointing to a Vue SFC. The frontend dynamically imports it and renders it in a named slot.

Both modes continue to work. The `PluginView.vue` component is enhanced to support both.

### Plugin loader composable

```typescript
// frontend/src/plugins/PluginLoader.ts

import type { Plugin, PluginCapabilities } from "@/types";

export type PluginRegistration = {
  id: string;
  capabilities: PluginCapabilities;
  component?: ReturnType<typeof defineComponent>;
  setup?: (ctx: FrontendPluginContext) => Promise<void> | void;
  teardown?: () => void;
};

const registrations = new Map<string, PluginRegistration>();

export async function loadPlugin(plugin: Plugin): Promise<void> {
  // ── 1. Load the script (legacy or module) ───────────────────────────
  if (plugin.has_script && plugin.script) {
    await loadPluginScript(plugin);
  }

  // ── 2. Load the Vue component (if declared) ─────────────────────────
  // Component URLs are served by the backend from the plugin directory
  // and must be built as ES modules exporting a Vue component.

  // ── 3. Fire the ready event ──────────────────────────────────────────
  window.slopsmith?.emit("plugin:load", { id: plugin.id });
}

async function loadPluginScript(plugin: Plugin): Promise<void> {
  // Backward-compatible: if the script registers a global, the existing
  // _loadScript path (creating a <script> element) still works.
  return new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = `/api/plugins/${plugin.id}/file/${plugin.script}?v=${plugin.version ?? 0}`;
    el.onload = () => resolve();
    el.onerror = () => {
      console.warn(`[Plugin] ${plugin.id} script failed to load`);
      reject();
    };
    document.head.appendChild(el);
  });
}

export function registerPlugin(reg: PluginRegistration): void {
  registrations.set(reg.id, reg);
}

export function getRegistration(id: string): PluginRegistration | undefined {
  return registrations.get(id);
}

export function getAllRegistrations(): PluginRegistration[] {
  return [...registrations.values()];
}
```

### Frontend plugin context

```typescript
// frontend/src/plugins/FrontendPluginContext.ts

export interface FrontendPluginContext {
  readonly pluginId: string;
  readonly eventBus: PluginEventBus;
  readonly api: {
    fetch(url: string, options?: RequestInit): Promise<Response>;
    // Typed API client for plugin-specific endpoints
    get(path: string): Promise<unknown>;
    post(path: string, body: unknown): Promise<unknown>;
  };
  readonly storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  readonly slots: SlotManager;
}
```

### Slot system

Plugins can render their UI into named **slots** in the application layout. Slots are predefined injection points that plugins register for.

```typescript
// frontend/src/plugins/SlotManager.ts

export type SlotName =
  | "visualization"        // main player canvas area
  | "settings-panel"       // settings page section
  | "nav-item"             // navigation sidebar item
  | "player-overlay"      // overlay on top of the player (e.g. tuner)
  | "player-controls"      // additional player control bar items
  | "library-card-badge"  // badges on song cards
  | "diagnostics-panel"   // diagnostics section
  | (string & {});         // extensible

export interface SlotRegistration {
  readonly pluginId: string;
  readonly slot: SlotName;
  readonly component: ReturnType<typeof defineComponent>;
  readonly props?: Record<string, unknown>;
  readonly order?: number;
}

export class SlotManager {
  private slots: Map<SlotName, SlotRegistration[]> = new Map();

  register(reg: SlotRegistration): void {
    const list = this.slots.get(reg.slot) ?? [];
    list.push(reg);
    list.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    this.slots.set(reg.slot, list);
  }

  get(slot: SlotName): SlotRegistration[] {
    return this.slots.get(slot) ?? [];
  }

  unregister(pluginId: string): void {
    for (const [slot, list] of this.slots.entries()) {
      this.slots.set(slot, list.filter(r => r.pluginId !== pluginId));
    }
  }
}
```

### Enhanced PluginView

```vue
<!-- frontend/src/views/PluginView.vue -->
<script setup lang="ts">
import { computed, onMounted, ref, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { usePluginsStore } from '@/stores/plugins'
import { getRegistration } from '@/plugins/PluginLoader'

const route   = useRoute()
const plugins = usePluginsStore()
const container = ref<HTMLElement | null>(null)

const pluginId = computed(() => route.params.id as string)
const plugin   = computed(() => plugins.plugins.find(p => p.id === pluginId.value))
const registration = computed(() => getRegistration(pluginId.value))

onMounted(async () => {
  if (!plugin.value) return
  // If the plugin registered a Vue component, that takes priority
  if (registration.value?.component) return

  // Fallback: load the plugin's screen HTML into the container
  if (plugin.value.screen) {
    try {
      const res = await fetch(`/api/plugins/${pluginId.value}/screen.html`)
      if (res.ok && container.value) {
        container.value.innerHTML = await res.text()
        container.value.querySelectorAll('script').forEach(old => {
          const s = document.createElement('script')
          for (const a of old.attributes) s.setAttribute(a.name, a.value)
          s.textContent = old.textContent
          old.parentNode.replaceChild(s, old)
        })
      }
    } catch (e) {
      console.warn(`[Plugin] ${pluginId.value} screen HTML not available`, e)
    }
  }
})
</script>

<template>
  <div class="min-h-screen bg-dark-800">
    <div v-if="!plugin" class="flex items-center justify-center h-64 text-gray-400 text-sm">
      Plugin not found
    </div>
    <component
      v-else-if="registration?.component"
      :is="registration.component"
      :plugin="plugin"
    />
    <div v-else ref="container" class="plugin-screen-container" />
  </div>
</template>
```

### PluginHost component for slots

A generic component that renders all plugins registered for a given slot:

```vue
<!-- frontend/src/components/plugins/PluginSlot.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useSlotManager } from '@/plugins/SlotManager'

const props = defineProps<{ name: string }>()
const slotManager = useSlotManager()
const registrations = computed(() => slotManager.get(props.name))
</script>

<template>
  <template v-for="reg in registrations" :key="reg.pluginId">
    <component :is="reg.component" v-bind="reg.props" />
  </template>
</template>
```

Usage in existing views:

```vue
<!-- In PlayerView.vue -->
<PluginSlot name="player-overlay" />
<PluginSlot name="player-controls" />

<!-- In SettingsView.vue -->
<PluginSlot name="settings-panel" />

<!-- In LibraryView.vue -->
<PluginSlot name="library-card-badge" />
```

---

## 7. AI Agent Integration

An LLM-powered agent is just another plugin-provided service, registered through the provider pattern.

### Agent provider interface

```typescript
// backend/src/domain/interfaces/providers/IAgentProvider.ts

export interface AgentMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCalls?: AgentToolCall[];
}

export interface AgentToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface AgentResponse {
  readonly message: string;
  readonly toolCalls?: AgentToolCall[];
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
}

export interface IAgentProvider {
  readonly name: string;
  readonly description?: string;

  /**
   * Send a multi-turn conversation to the agent and receive a response.
   * The agent may invoke tools registered in the AgentToolRegistry.
   */
  chat(messages: AgentMessage[], options?: AgentChatOptions): Promise<AgentResponse>;

  /**
   * Stream a response. Returns an async iterable of partial responses.
   */
  chatStream?(messages: AgentMessage[], options?: AgentChatOptions): AsyncIterable<AgentResponse>;

  /**
   * List available models/capabilities.
   */
  listModels?(): Promise<AgentModel[]>;
}

export interface AgentChatOptions {
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly tools?: string[];  // tool names to make available
}

export interface AgentModel {
  readonly id: string;
  readonly name: string;
  readonly contextLength?: number;
}
```

### Agent tool registry

Plugins can register tools that agents can invoke:

```typescript
// backend/src/infrastructure/plugins/AgentToolRegistry.ts

export interface AgentTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: JSONSchema;    // simplified JSON Schema for parameters
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export class AgentToolRegistry {
  private tools: Map<string, AgentTool> = new Map();

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
  }

  /** Return tool definitions in OpenAI function-calling format */
  toOpenAITools(): OpenAITool[] {
    return [...this.tools.values()].map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}
```

### Agent plugin example

```json
{
  "id": "agent_openai",
  "name": "OpenAI Agent",
  "version": "1.0.0",
  "type": "agent",
  "script": "index.ts",
  "providers": [
    { "type": "agent", "name": "openai", "factory": "createAgent" }
  ],
  "hooks": [
    { "event": "song:load", "phase": "after" },
    { "event": "library:scan:complete", "phase": "after" }
  ],
  "settings": { "html": "settings.html" }
}
```

```typescript
// plugins/agent_openai/index.ts

import type { PluginModule, PluginContext } from "../../domain/interfaces/plugins/index.js";
import type { IAgentProvider, AgentMessage, AgentResponse } from "../../domain/interfaces/providers/IAgentProvider.js";

class OpenAIAgentProvider implements IAgentProvider {
  readonly name = "openai";
  readonly description = "OpenAI-compatible LLM agent";

  constructor(private ctx: PluginContext, private apiKey: string, private baseUrl: string) {}

  async chat(messages: AgentMessage[], options?: AgentChatOptions): Promise<AgentResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options?.model ?? "gpt-4",
        messages,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
        tools: options?.tools
          ? this.ctx.agentTools.toOpenAITools().filter(t => options.tools!.includes(t.function.name))
          : undefined,
      }),
    });
    // ... parse response
  }

  async listModels(): Promise<AgentModel[]> { /* ... */ }
}

export const setup = (ctx: PluginContext): void => {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

  if (!apiKey) {
    ctx.logger.warn("OPENAI_API_KEY not set; agent will be unavailable");
    return;
  }

  ctx.providers.register("agent", "openai", new OpenAIAgentProvider(ctx, apiKey, baseUrl));

  // Register tools this agent can use
  ctx.hooks.on("song:load", async (payload) => {
    // Could trigger agent analysis of song metadata, etc.
  });
};

export const teardown = (ctx: PluginContext): void => {
  // Cleanup: cancel any in-flight requests
};

export default { setup, teardown } satisfies PluginModule;
```

### Core service using an agent

```typescript
// Example: song analysis using whatever agent is configured
export class AnalysisService {
  constructor(private providers: ProviderRegistry, private tools: AgentToolRegistry) {}

  async analyzeSong(filename: string, songInfo: SongInfo): Promise<string | null> {
    const agent = this.providers.get<IAgentProvider>("agent");
    if (!agent) return null;

    const response = await agent.chat([
      { role: "system", content: "You are a music theory assistant." },
      { role: "user", content: `Analyze the song "${songInfo.title}" by ${songInfo.artist}.` },
    ], {
      tools: ["search_song_metadata", "calculate_tempo"],
    });

    return response.message;
  }
}
```

---

## 8. Project Structure

```
slopsmith/
├── backend/
│   └── src/
│       ├── domain/
│       │   ├── errors.ts
│       │   ├── models/
│       │   │   ├── plugin.ts              # Updated manifest/capabilities types
│       │   │   ├── song.ts
│       │   │   └── library.ts
│       │   ├── interfaces/
│       │   │   ├── providers/
│       │   │   │   ├── IStorageProvider.ts
│       │   │   │   ├── IMetadataProvider.ts
│       │   │   │   ├── IAgentProvider.ts    # NEW
│       │   │   │   └── index.ts             # ProviderMap type
│       │   │   └── plugins/
│       │   │       ├── PluginContext.ts     # NEW
│       │   │       ├── PluginModule.ts      # NEW
│       │   │       └── index.ts
│       │   └── repositories.ts
│       ├── infrastructure/
│       │   ├── plugins/
│       │   │   ├── PluginRegistry.ts        # Updated to validate new manifest
│       │   │   ├── PluginLifecycle.ts        # NEW
│       │   │   ├── HookSystem.ts            # NEW
│       │   │   ├── ProviderRegistry.ts       # NEW
│       │   │   ├── RouteRegistrar.ts         # NEW
│       │   │   ├── AgentToolRegistry.ts      # NEW
│       │   │   └── PluginStorage.ts          # NEW — plugin-scoped kv store
│       │   ├── db/
│       │   └── ...
│       ├── services/
│       │   ├── PluginService.ts             # Updated — orchestrates lifecycle
│       │   ├── StorageService.ts            # Updated — delegates to provider
│       │   └── ...
│       ├── api/
│       │   ├── routes/
│       │   │   ├── plugins.ts              # Updated — provider/settings API
│       │   │   └── ...
│       │   └── ws/
│       │       └── ...
│       ├── types/
│       │   └── fastify.d.ts                # Updated — add plugin services
│       └── server.ts                        # Updated — wire all plugin infra
│
├── frontend/
│   └── src/
│       ├── plugins/
│       │   ├── PluginLoader.ts              # NEW
│       │   ├── PluginEventBus.ts            # NEW
│       │   ├── FrontendPluginContext.ts     # NEW
│       │   ├── SlotManager.ts               # NEW
│       │   ├── legacyAdapter.ts             # NEW
│       │   └── index.ts
│       ├── components/
│       │   └── plugins/
│       │       └── PluginSlot.vue           # NEW
│       ├── views/
│       │   └── PluginView.vue              # Updated — component mode
│       ├── stores/
│       │   └── plugins.ts                  # Updated — load component mode
│       ├── api/
│       │   └── plugins.ts                  # Updated — provider API
│       └── types/
│           └── index.ts                    # Updated — new plugin types
│
├── plugins/                                 # Bundled plugins
│   ├── highway_3d/
│   │   ├── plugin.json                     # Updated manifest
│   │   ├── index.ts                        # NEW — backend entry
│   │   ├── screen.js                       # Existing (legacy script mode)
│   │   ├── HighwayPlugin.vue               # NEW — Vue component mode
│   │   ├── settings.html
│   │   ├── routes.py                       # DEPRECATED (migrate to index.ts)
│   │   └── tour.json
│   ├── pitch_yin/
│   │   ├── plugin.json
│   │   ├── screen.js
│   │   └── settings.html
│   ├── app_tour_library/
│   │   ├── plugin.json
│   │   ├── script.js
│   │   └── tour.json
│   ├── app_tour_settings/
│   │   ├── plugin.json
│   │   ├── script.js
│   │   └── tour.json
│   └── storage_s3/                          # NEW example provider plugin
│       ├── plugin.json
│       ├── index.ts
│       └── settings.html
│
└── docs/
    └── plugin-architecture.md              # This document
```

### Key new files

| File | Purpose |
|------|---------|
| `domain/interfaces/plugins/PluginContext.ts` | Typed context passed to every plugin `setup()` |
| `domain/interfaces/plugins/PluginModule.ts` | Interface for plugin entry: `{ setup, teardown? }` |
| `domain/interfaces/providers/IAgentProvider.ts` | Agent provider contract for LLM integration |
| `infrastructure/plugins/PluginLifecycle.ts` | Orchestrates discover → validate → load → setup → teardown |
| `infrastructure/plugins/HookSystem.ts` | Typed async hook pipeline with before/after phases |
| `infrastructure/plugins/ProviderRegistry.ts` | Multi-provider registry with active selection |
| `infrastructure/plugins/RouteRegistrar.ts` | Scoped route registration for plugins (`/api/plugins/{id}/...`) |
| `infrastructure/plugins/PluginStorage.ts` | Per-plugin key-value storage in config dir |
| `infrastructure/plugins/AgentToolRegistry.ts` | Tool registry for agent function calling |
| `frontend/src/plugins/PluginLoader.ts` | Dynamic script/component loading |
| `frontend/src/plugins/PluginEventBus.ts` | Typed frontend event bus |
| `frontend/src/plugins/FrontendPluginContext.ts` | Scoped context for frontend plugin scripts |
| `frontend/src/plugins/SlotManager.ts` | Named UI slot registration |
| `frontend/src/plugins/legacyAdapter.ts` | Backward-compat adapter for `window.slopsmith` |
| `frontend/src/components/plugins/PluginSlot.vue` | Generic slot renderer component |

---

## 9. Migration Path

### Phase 1: Parallel operation (no breaking changes)

The current system works as-is. The new plugin infrastructure is added alongside it:

1. **Add new infrastructure files** — `HookSystem`, `ProviderRegistry`, `PluginLifecycle`, `RouteRegistrar`, etc. All new code, no modifications to existing files except `server.ts` which wires the new services.

2. **Update `PluginRegistry.discover()`** — extend it to validate the new manifest fields (`hooks`, `providers`, `routes`, `ws`, `dependsOn`) but treat them as optional. Existing plugin manifests that don't declare these fields continue to work unchanged.

3. **Wire lifecycle in `server.ts`** — After the existing `pluginRegistry.discover()`, run `pluginLifecycle.start()`. If a plugin has no `script` field or the module doesn't export `setup`, it's skipped gracefully.

4. **Keep Python route loading** — The current `routes.py` bridge (referenced in `plugin.json`'s `routes` field as a string path) continues to work. The backend recognizes a `routes` field that is a string (Python path) vs. an array of `PluginRouteDecl` objects (TypeScript). Both paths are supported:

   ```typescript
   // In RouteRegistrar:
   if (typeof manifest.routes === "string") {
     // Legacy: routes.py — handled by the Python bridge (no-op here)
     return;
   }
   if (Array.isArray(manifest.routes)) {
     // New: TypeScript route declarations
     for (const routeDecl of manifest.routes) {
       this.registerRoute(plugin, routeDecl);
     }
   }
   ```

5. **Frontend** — Both the existing `<script>` loading (for `screen.js`) and the new Vue component mode are supported. `PluginView.vue` checks for a registered component first, then falls back to HTML injection.

### Phase 2: Migrate existing plugins one at a time

For each existing plugin:

1. **`highway_3d`**: Create `index.ts` that exports a `setup()` function registering the HTTP routes (currently in `routes.py`). Create `HighwayPlugin.vue` as a proper Vue component wrapper around the existing `screen.js`. The `screen.js` global-registration pattern (`window.slopsmithViz_highway_3d`) continues to work — the Vue component just provides a more structured mounting point. Add `"component": "HighwayPlugin.vue"` to `plugin.json`. The old `"script": "screen.js"` field is kept for backward compat.

2. **`pitch_yin`**: Add `index.ts` with a hook registration (`note:hit` for pitch detection logic). Migrate `settings.html` to a Vue component when convenient.

3. **Tour plugins** (`app_tour_library`, `app_tour_settings`): These are frontend-only and need no backend migration. They continue using `"script"` mode.

### Phase 3: Deprecation

Once all bundled plugins have migrated:

- Remove the Python `routes.py` bridge.
- Remove the `string` typing for `manifest.routes` (require `PluginRouteDecl[]`).
- Remove `window.slopsmithViz_*` global registration (require Vue component or explicit `PluginModule` registration).
- Update `PluginView.vue` to remove HTML-injection fallback in favor of component-only.

### Provider migration

The `StorageService` and any future `MetadataService` migration follows this pattern:

1. Create the `ProviderRegistry` and wire it into `server.ts`.
2. Create a `LocalStorageProvider` plugin that implements `IStorageProvider` using the current filesystem logic.
3. In `StorageService`, delegate to `providerRegistry.get<IStorageProvider>("storage")`.
4. The `localStorage` provider is registered as a bundled plugin and set as the default active provider.
5. Third-party providers (S3, etc.) register through the plugin `setup` and can be activated via a settings API endpoint.

### Settings UI for provider selection

Add a new API endpoint and settings section:

```typescript
// backend/src/api/routes/plugins.ts (addition)
fastify.get("/api/plugins/providers", async () => {
  return providerRegistry.listWithStatus();
});

fastify.put("/api/plugins/providers/:type/active", async (req) => {
  const { type, name } = req.params as { type: string; name: string };
  providerRegistry.setActive(type, name);
  return { ok: true };
});
```

The Settings page gets a new "Providers" section where users can see registered providers and switch the active one for each type.

---

## Appendix: Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `setup(ctx)` over class-based plugins | Functional setup is simpler to type, easier to tree-shake, and matches the Fastify plugin pattern the team already uses. |
| Hook `phase: before/after` rather than `pre/post` naming | Allows future extension (e.g., `validate`, `transform`) and mirrors the Fastify hook model. |
| Provider registry per type | Avoids a single god-registry. Storage providers don't need to know about metadata providers. |
| Dynamic `import()` for plugin modules | No eval, no `vm.Script`. ESM imports are sandboxed by the module scope and can be cached/invalidated. |
| Frontend `SlotManager` over named events for UI injection | Named slots give predictable render order and allow Vue component composition, while events are fire-and-forget. |
| Manifest declares script, setup is imperative | The manifest is declarative for discovery; the setup function is imperative for runtime behavior. This avoids manifest schema explosion for every new capability. |
| `string & {}` for extensibility | TypeScript pattern that allows predefined literal types while preserving string extensibility for custom events and provider types. |
| Plugin-scoped storage | Each plugin gets its own namespace in the config directory, preventing key collisions and making cleanup (teardown) straightforward. |