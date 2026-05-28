# SlopSmith Plus — Wiki

> Browse, play, and practice your Rocksmith 2014 CDLC collection — entirely in your browser, entirely in Docker.

SlopSmith Plus is a self-hosted web application that turns your CDLC library into an interactive note highway player. It runs as a single Docker Compose stack: no cloud accounts, no subscriptions, no internet required after setup.

---

## What it does

```
Your DLC folder  →  Auto-scanned  →  Library browser  →  Note highway player
      (PSARC / Sloppak / Loose)          (search, filter, favourites)
                                                              |
                                               Real-time pitch detection
                                               A-B loop practice
                                               Per-profile scores & history
                                               VST plugin chain (via SlopAudio Connect)
```

**Supported formats**

| Format | Description |
|---|---|
| PSARC | Official Rocksmith DLC and Custom CDLC (CustomsForge) — AES-CFB-128 decrypted in memory |
| Sloppak | SlopSmith's open format — unencrypted ZIP or directory with a YAML manifest |
| Loose | Unpacked folder containing XMLs or a manifest — convenient for manual editing |
| SNG | Compiled Rocksmith binary — auto-converted to XML via the built-in RsCli tool |

---

## How the system fits together

```
                    Browser
                       |
              +---------+---------+
              |                   |
          Frontend            WebSocket
        (Vue 3 SPA)       (real-time events)
              |                   |
              +-------------------+
                       |
                Fastify Backend  :8085
                       |
          +------------+------------+
          |            |            |
     PostgreSQL      MinIO     SlopAudio
      :5432         :9000       Connect
   (metadata,    (covers,       (VST chain,
   sessions,      audio,    pitch detection)
   scores)        stems)
```

Five Docker services, all defined in `docker-compose.yml`. The browser talks only to the frontend on port **8006**; the frontend proxies API and WebSocket traffic to the backend on port **8085**.

---

## Quick-start

```bash
git clone https://github.com/johncoco12/SlopSmith-Plus
cd SlopSmith-Plus
docker compose up -d
```

Open **http://localhost:8006** in your browser. The library scans in the background — the UI is usable immediately.

**Environment variables** (set in `docker-compose.yml` or a `.env` file)

| Variable | Default | Description |
|---|---|---|
| `DLC_PATH` | Steam DLC path | Host path to your DLC folder |
| `LOG_LEVEL` | `info` | `trace` / `debug` / `info` / `warn` / `error` |
| `LOG_PRETTY` | `true` | `false` for JSON logs (Loki, ELK, Promtail) |
| `SAC_SERVER_NAME` | `SlopSmith` | Name broadcast to SlopAudio Connect on the LAN |
| `SAC_SERVER_IP` | auto | Override when auto-detected IP is a VPN or Docker bridge |
| `SAC_HTTP_PORT` | same as `PORT` | Advertised port when a reverse proxy changes the external port |

---

## Features at a glance

### Library

- Grid view with album art, arrangement badges, tuning, and lyrics indicator
- Artist / album tree with A–Z letter filter
- Full-text search across artist, title, and album
- Filter by format, arrangement type, stem availability, tuning, and lyrics
- Sort by artist, title, recently added, tuning, or year
- Per-profile favourites
- In-place metadata editing (title, artist, album, cover art)
- One-click retune to E Standard for Eb / D / C# / C songs

### Player

- **3D highway** — depth-aware camera, per-string lane glow, Three.js rendering
- **Classic 2D highway** — Canvas-based, suitable for lower-powered devices
- Arrangement switcher (Lead / Rhythm / Bass) mid-playback
- Speed control — 0.25× to 1.5× with pitch correction (rubberband)
- Synced karaoke-style lyrics overlay (toggleable)
- Dynamic anchor zoom — fret window adjusts ahead of approaching notes
- Real-time pitch detection via YIN algorithm (compiled to WASM)
- Score submission with best-score tracking per profile

**Techniques rendered:** bends (1/2 · full · 1½ · 2), slides, hammer-ons, pull-offs, taps, palm mutes, vibrato, harmonics, pinch harmonics, accents, tremolo, unison bends

### Practice tools

- **A-B Looping** — mark any start and end point, replay instantly
- **Saved Loops** — name and store multiple loops per song across sessions
- **Mastery Slider** — gradually reveal harder notes on songs with phrase difficulty data

### Profiles & access control

- Multiple profiles on a single instance — isolated settings, scores, and loops per profile
- PIN protection with recovery phrases and admin reset
- Custom avatars
- Permission groups (Admin, Upload, Edit Tracks, Delete Tracks, Manage Settings, …)

### VST Plugin Chain (via SlopAudio Connect)

The companion app **SlopAudio Connect** connects to SlopSmith over your LAN, enabling features that require direct audio hardware access:

- Route your instrument through a VST3 plugin chain (EQ, reverb, pitch shift, amp sims, …)
- View and control the chain live from the SlopSmith UI — bypass, reorder, add, remove, adjust parameters
- Low-latency pitch detection fed directly from your audio interface

> Download: [github.com/johncoco12/SlopAudio-Connect](https://github.com/johncoco12/SlopAudio-Connect)

### Plugin System *(experimental)*

An extensible plugin architecture lets plugins add UI slots, backend routes, event hooks, and swappable service providers.

**Bundled plugins**

| Plugin | What it does |
|---|---|
| Themes | 9 built-in colour themes — persisted server-side per profile |
| Leaderboard | Per-song score tracking and leaderboard view |
| YIN Pitch Detector | Real-time pitch detection via WASM — powers the note recognition system |

> The plugin API is experimental. Breaking changes are expected until it stabilises. Legacy Slopsmith (v1) plugins are not yet supported.

---

## Scalability

- Parallel metadata extraction — 4 files processed concurrently during scan
- PostgreSQL-backed search with server-side pagination — tested beyond 80,000 songs
- MinIO object storage separates binary assets from the database
- Background scanning never blocks the UI

---

## Wiki Contents

### Getting started

| | |
|---|---|
| **[Architecture Overview](architecture.md)** | Tech stack, service ports, startup sequence, data-flow diagram, storage layout |
| **[Authentication & Profiles](authentication.md)** | PIN auth, session tokens, WebSocket auth, lockout and recovery, permission groups |

### Core systems

| | |
|---|---|
| **[Library System](library.md)** | Scanning pipeline, format detection, metadata extraction, search parameters, favourites, editing, deletion |
| **[Player & Highway](player.md)** | HighwayResponse shape, wire format for all chart types, renderers, pitch detection, mastery, A-B loops, scoring |
| **[SlopPak Format](sloppak-format.md)** | manifest.yaml reference, arrangement JSON field-by-field, lyrics format, stems, extensibility |
| **[Database Schema](database-schema.md)** | Every Prisma model — all fields, types, and relations |
| **[API Reference](api-reference.md)** | Every REST endpoint — method, auth requirement, request/response shape |

### Plugin system

| | |
|---|---|
| **[Plugin System Overview](plugin-system-overview.md)** | Two-sided architecture, lifecycle state machine, backend vs frontend plugin concepts |
| **[Plugin Development Guide](plugin-development-guide.md)** | Manifest, backend module, Vue SFC, providers, permissions, dev tips |
| **[Hook & Slot Reference](plugin-hooks-slots-reference.md)** | All backend hook events and frontend UI slot names |
| **[Plugin API Reference](plugin-api-reference.md)** | PluginContext, FrontendPluginContext, REST plugin endpoints, legacy global API |
| **[VST Plugin Chain](plugin-chain-vst.md)** | SlopAudio Connect network protocol, CHAIN_STATE shape, control commands, PluginChainPanel, troubleshooting |

---

## Where to start

**I want to set up the app**
→ [Architecture Overview](architecture.md) then follow the Quick Start above.

**I want to understand how songs are loaded and played**
→ [Library System](library.md) → [Player & Highway](player.md)

**I want to create my own song files**
→ [SlopPak Format](sloppak-format.md)

**I want to build a plugin**
→ [Plugin System Overview](plugin-system-overview.md) → [Plugin Development Guide](plugin-development-guide.md)

**I want to integrate with the REST API**
→ [API Reference](api-reference.md)

**I want to use VST plugins with my guitar**
→ [VST Plugin Chain](plugin-chain-vst.md)
