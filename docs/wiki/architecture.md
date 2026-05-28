# Architecture Overview

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3, TypeScript, Pinia, Vue Router, Tailwind CSS, Three.js / TresJS, vue-i18n |
| Backend | Node.js 20, Fastify, TypeScript, Prisma ORM, tsyringe (DI) |
| Database | PostgreSQL 16 |
| Object Storage | MinIO (S3-compatible) |
| Real-time | WebSocket via `@fastify/websocket` |
| Audio Processing | FFmpeg, FluidSynth, vgmstream, rubberband |
| Audio Companion | SlopAudio Connect (JUCE, C++) |

---

## Services & Ports

| Service | Port | Description |
|---|---|---|
| Frontend (Nginx + SPA) | 8006 | Vue 3 single-page application |
| Backend API | 8085 | Fastify REST + WebSocket |
| PostgreSQL | 5432 | Primary database |
| MinIO (S3 API) | 9000 | Object storage (covers, audio, stems) |
| MinIO (console) | 9001 | Web UI for MinIO management |
| SAC beacon | 54920 UDP | SlopAudio Connect discovery |
| SAC control | 54921 UDP | VST chain commands + state |
| SAC pitch | 54922 UDP | Real-time pitch data |

---

## High-Level Diagram

```
Browser
  │
  │  HTTP / WebSocket (port 8006 → proxy → 8085)
  ▼
┌──────────────────────────────────────────────────────┐
│                   Fastify Backend                     │
│                                                      │
│  Route Layer                                         │
│  ├── /api/library/**      LibraryService             │
│  ├── /api/tracks/**       TrackService               │
│  ├── /api/auth/**         ProfileService             │
│  ├── /api/profiles/**     ProfileService             │
│  ├── /api/plugins/**      PluginService              │
│  ├── /api/settings/**     SettingsService            │
│  └── /api/tracks/:id/highway  HighwayService         │
│                                                      │
│  Infrastructure                                      │
│  ├── Prisma → PostgreSQL                             │
│  ├── MinIO client → MinIO                            │
│  ├── PluginRegistry / PluginLifecycle                │
│  └── SacSessionService → SlopAudio Connect (UDP)    │
└──────────────────────────────────────────────────────┘
         │               │
         ▼               ▼
    PostgreSQL          MinIO
  (metadata,         (covers, audio,
   sessions,          stems, exports)
   scores, loops)
```

---

## Backend Dependency Injection

The backend uses **tsyringe** for dependency injection. Services are registered as singletons in the composition root (`server.ts`) and injected into route handlers and other services via constructor injection.

Key singletons:
- `LibraryService`
- `TrackService`
- `ImportService`
- `ScannerService`
- `HighwayService`
- `ProfileService`
- `PermissionsService`
- `SettingsService`
- `LoopService`
- `TrackScoreService`
- `PluginService`
- `SacSessionService`

---

## Startup Sequence

1. Load environment variables and configuration (`config.json`)
2. Connect Prisma to PostgreSQL
3. Initialise MinIO client and verify bucket access
4. Register all services in the DI container
5. Discover and load plugins (`PluginLifecycle.start()`)
6. Register Fastify routes (core + plugin-scoped)
7. Start Fastify on port 8085
8. Emit `server:startup` hook
9. Begin UDP listener for SlopAudio Connect (port 54921)
10. Start periodic library scan if configured

**Shutdown** (SIGTERM/SIGINT):
1. Emit `server:shutdown` hook
2. Teardown active plugins in reverse load order
3. Close Fastify (drain in-flight requests)
4. Disconnect Prisma

---

## Data Flow: Song to Playback

```
DLC File (PSARC / Sloppak / Loose)
        │
        │ ScannerService detects file
        ▼
   ImportService
   ├── Extract metadata → PostgreSQL Song table
   ├── Extract cover art → MinIO (cover_{trackId})
   └── Extract audio → FFmpeg → OGG → MinIO (audio_{trackId})
        │
        ▼
   PostgreSQL (Song + Track + TrackData records)
        │
        │  GET /api/library → Song list
        │  GET /api/tracks/:id/highway → HighwayResponse (chart data)
        │  GET /api/tracks/:id/audio → OGG stream (range-supported)
        ▼
   Frontend Player
   ├── Audio element (OGG stream)
   ├── Renderer (2D highway / 3D modernway / tab)
   └── Pitch detection (YIN WASM)
```

---

## Frontend Structure

```
src/
├── main.ts                  # App entry, plugin system init
├── router/                  # Vue Router routes
├── plugins/                 # Plugin system (loader, event bus, slots)
├── features/
│   ├── library/             # Song browser
│   ├── player/              # Playback, highway, scoring
│   ├── profiles/            # Profile management + auth
│   ├── settings/            # App settings
│   ├── admin/               # Permissions, diagnostics
│   └── plugins/             # Plugin browser
├── components/
│   ├── layout/              # AppNav, ProfileSwitcher
│   ├── ui/                  # AppDialog, AppToggle, etc.
│   └── plugins/             # PluginSlot renderer
└── types/                   # Shared TypeScript types
```

---

## Storage Layout (MinIO)

All binary assets live in a single MinIO bucket. Objects are identified by a stable string key:

| Key pattern | Contents |
|---|---|
| `cover_{trackId}` | PNG album art |
| `audio_{trackId}` | OGG audio (full mix) |
| `stem_{trackId}_{stemIndex}` | OGG per-instrument stem |
| `export_{uuid}` | Temporary export bundles |

---

## Song Format Support

| Format | Description | Notes |
|---|---|---|
| **PSARC** | AES-CFB-128 encrypted Rocksmith archives | Official DLC; decrypted at read time |
| **Sloppak** | Unencrypted directory or ZIP | Open format; see [SlopPak Format](sloppak-format.md) |
| **Loose** | Unpacked folder with manifest or XMLs | Convenience format for manual editing |
| **SNG** | Compiled Rocksmith binary chart | Auto-converted to XML via RsCli on first load |

Detection is automatic — the scanner identifies format by extension and directory structure. Scanning runs 4 files in parallel.

---

## See Also

- [Library System](library.md)
- [Player & Highway](player.md)
- [Authentication & Profiles](authentication.md)
- [Plugin System Overview](plugin-system-overview.md)
- [SlopPak Format](sloppak-format.md)
- [Database Schema](database-schema.md)
