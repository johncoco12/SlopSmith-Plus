# Plugin System Overview

SlopSmith's plugin system is a two-sided architecture: a **host plugin system** that extends SlopSmith itself with new features, and a **VST plugin chain** that manages real-time audio processing via SlopAudio Connect (SAC). Both sides share a common control surface through the backend.

---

## Two Kinds of "Plugin"

| Concept | What it is | Lives in |
|---|---|---|
| **SlopSmith Plugin** | Extends the app (UI slots, hooks, providers, routes) | `pluginsDir/`, loaded at server start |
| **VST Plugin Chain** | Real audio DSP plugins (EQ, reverb, pitch shift…) | SlopAudio Connect companion app |

These are separate systems that coexist. A SlopSmith plugin could expose a UI for controlling the VST chain — they are designed to compose.

---

## SlopSmith Plugin Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Backend                              │
│                                                             │
│  PluginRegistry ──► PluginLifecycle ──► (loaded plugins)   │
│       │                                        │           │
│  Discovery        HookSystem          ProviderRegistry      │
│  Validation       RouteRegistrar      PluginDb              │
│  Dependency       PermissionRegistry                        │
│  Sorting                                                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST /api/plugins/**
┌───────────────────────────▼─────────────────────────────────┐
│                       Frontend                              │
│                                                             │
│  PluginStore ──► PluginLoader ──► (components / scripts)   │
│      │                                     │               │
│  PluginEventBus      SlotManager    FrontendPluginContext   │
│  legacyAdapter       PluginSlot.vue                        │
└─────────────────────────────────────────────────────────────┘
```

### Backend

- **PluginRegistry** — Scans builtin and user plugin directories, reads `plugin.json` manifests, resolves dependency order via topological sort.
- **PluginLifecycle** — Drives each plugin through states: `discovered → validating → loading → setting_up → active → tearing_down → disabled`. Calls the plugin module's `setup(ctx)` and `teardown(ctx)` exports.
- **HookSystem** — Event bus with phases (`before`/`after`), priorities, and error isolation so a faulty plugin can't crash the host.
- **ProviderRegistry** — Allows plugins to register swappable implementations (storage backends, metadata scrapers, AI agents).
- **RouteRegistrar** — Scopes each plugin's HTTP/WebSocket routes under `/api/plugins/{pluginId}/` and `/ws/plugins/{pluginId}/`.
- **PluginDb** — Per-plugin key-value persistence backed by the main database.
- **PermissionRegistry** — Plugins can define custom permissions shown in the admin UI.

### Frontend

- **PluginLoader** — Injects `<script>` tags and dynamically imports Vue SFCs returned by the manifest.
- **PluginEventBus** — Typed DOM-based event emitter shared across all plugins.
- **SlotManager** — Named UI injection points. Plugins register components into slots; host views render them via `<PluginSlot name="…" />`.
- **FrontendPluginContext** — Scoped API surface passed to every frontend plugin's `setup()`.
- **legacyAdapter** — Shim exposing `window.slopsmith.emit/on` for scripts that predate the current system.

---

## VST Plugin Chain Architecture

```
┌──────────────────────────┐    UDP 54921/54922    ┌────────────────────────┐
│   SlopAudio Connect      │◄─────────────────────►│   SlopSmith Backend    │
│   (JUCE app)             │                        │   SacSessionService    │
│                          │                        │         │              │
│  PluginChainProcessor    │                        │       WebSocket        │
│  SessionController       │                        │         │              │
│  DiscoveryBeacon 54920   │                        └─────────┼──────────────┘
└──────────────────────────┘                                  │
                                                   ┌──────────▼──────────────┐
                                                   │   SlopSmith Frontend     │
                                                   │   PluginChainPanel.vue   │
                                                   └──────────────────────────┘
```

SAC runs as a standalone companion app on the same machine. It scans for VST3 plugins, manages a real-time audio processing chain, and communicates state over UDP. The backend bridges UDP ↔ WebSocket so the frontend can display and control the chain live.

---

## Plugin Lifecycle (Backend)

```
discovered
    │  (manifest read, dependencies checked)
    ▼
validating
    │  (schema validation)
    ▼
loading
    │  (dynamic ESM import of script)
    ▼
setting_up
    │  (plugin.setup(ctx) called)
    ▼
active          ◄──── normal running state
    │
    │  (disable request or shutdown)
    ▼
tearing_down
    │  (plugin.teardown(ctx) called)
    ▼
disabled        (persisted in disabled-plugins.json)
```

---

## Plugin Types

| Type | What it provides |
|---|---|
| `visualization` | Renders into the player canvas area |
| `provider` | Registers a swappable backend service (storage, metadata, agent) |
| `frontend-only` | Adds UI slots / event handlers, no backend script |
| `full-stack` | Both a backend module and a Vue component |

---

## Further Reading

- [Plugin Development Guide](plugin-development-guide.md) — Build your first plugin
- [Hook & Slot Reference](plugin-hooks-slots-reference.md) — All available hooks and UI slots
- [Plugin API Reference](plugin-api-reference.md) — REST endpoints and context APIs
- [VST Plugin Chain](plugin-chain-vst.md) — SlopAudio Connect integration deep-dive
- [Architecture Overview](architecture.md) — How plugins fit into the overall system
- [API Reference](api-reference.md) — Full REST API (includes plugin endpoints)
