# Legacy Backend Architecture

> Python/FastAPI backend (`legacy/server.py`, ~4467 lines) serving the highway viewer, library management, plugin system, audio processing, and diagnostics.

## Runtime Environment

| Aspect | Detail |
|--------|--------|
| Framework | FastAPI with uvicorn (ASGI) |
| Python | 3.12 |
| Entry point | `python main.py` or `uvicorn server:app` |
| DB | In-memory SQLite3 via custom `MetadataDB` class |
| Logging | `structlog` with JSON mode, correlation IDs via `structlog.contextvars` |
| Config | JSON file at `CONFIG_DIR/config.json` + env vars |
| Concurrency | `threading.Thread` for background scans, `concurrent.futures` for plugin loading, `asyncio` for WebSocket |
| Static files | FastAPI `StaticFiles` mount on `/static/` |
| SPA fallback | Catch-all route serving `static/index.html` |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DLC_DIR` | `~/.local/share/rocksmith-cdlc` | Song library root |
| `CONFIG_DIR` | `~/.local/share/rocksmith-cdlc` | Persistent config path |
| `RSCLI_PATH` | — | Path to RsCli binary for PSARC operations |
| `VGMSTREAM_CLI` | — | Path to vgmstream-cli for WEM decoding |
| `PORT` | `8080` | HTTP listen port |
| `HOST` | `0.0.0.0` | HTTP listen host |
| `LOG_LEVEL` | `info` | Logging level |
| `LOG_PRETTY` | `false` | Pretty-print structured logs |
| `SLOPSMITH_DEMO_MODE` | — | Enables demo mode guard |
| `APP_SOURCE_URL` | `https://github.com/byrongamatos/slopsmith` | Source link in Settings About |
| `APP_LICENSE_URL` | `<source_url>/blob/main/LICENSE` | License link in Settings About |
| `APP_VERSION` | contents of `VERSION` file | Version string |
| `SLOPSMITH_SKIP_STARTUP_TASKS` | — | Test escape hatch skips plugin load + scan |
| `SLOPSMITH_PLUGINS_DIR` | — | Additional plugin directory |
| `SLOPSMITH_SYNC_STARTUP` | — | Load plugins synchronously (for desktop mode) |

### Derived Paths

| Path | Formula |
|------|---------|
| `CONFIG_DIR` | `$CONFIG_DIR` or `~/.local/share/rocksmith-cdlc` |
| `AUDIO_CACHE_DIR` | `CONFIG_DIR / audio_cache` |
| `ART_CACHE_DIR` | `CONFIG_DIR / art_cache` |
| `SLOPPAK_CACHE_DIR` | `CONFIG_DIR / sloppak_cache` |
| `DATABASE_PATH` | `CONFIG_DIR / meta.db` |
| `SETTINGS_PATH` | `CONFIG_DIR / config.json` |

## Database Schema

In-memory SQLite via custom `MetadataDB` class with `threading.Lock`. No migrations — additive column changes only.

### `songs` table

Stores scanned song metadata. Populated by the background scanner and `_extract_meta_for_file`.

| Column | Type | Description |
|--------|------|-------------|
| `filename` | TEXT PRIMARY KEY | Relative path from DLC dir |
| `mtime` | REAL | File modification time (Unix timestamp) |
| `size` | INTEGER | File size in bytes |
| `title` | TEXT | Song title |
| `artist` | TEXT | Artist name |
| `album` | TEXT | Album name |
| `year` | TEXT | Release year |
| `duration` | REAL | Song length in seconds |
| `tuning` | TEXT | Comma-separated semitone offsets (e.g. `"0,0,0,0,0,0"`) |
| `arrangements` | TEXT | JSON array of `{index, name, notes}` |
| `has_lyrics` | INTEGER | Boolean |
| `format` | TEXT | `"psarc"`, `"sloppak"`, or `"loose"` |
| `stem_count` | INTEGER | Number of stems (sloppak) |
| `stem_ids` | TEXT | JSON array of stem identifiers |
| `tuning_name` | TEXT | Human-readable tuning name (e.g. `"E Standard"`) |
| `tuning_sort_key` | INTEGER | Numerical sorting key for tuning ordering |

### `favorites` table

| Column | Type | Description |
|--------|------|-------------|
| `filename` | TEXT PRIMARY KEY | FK to songs.filename |

### `loops` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `filename` | TEXT | FK to songs.filename |
| `name` | TEXT | Loop name |
| `start_time` | REAL | Start in seconds |
| `end_time` | REAL | End in seconds |

### Query Methods

- `get(filename, mtime, size)` — Returns cached metadata if mtime+size match, else None
- `put(filename, mtime, size, meta)` — Insert or update metadata row
- `delete_missing(current_filenames)` — Removes rows for deleted files
- `toggle_favorite(filename)` — Returns new boolean state
- `query_page(q, page, size, sort, ...)` — Paginated library query with full filtering/sorting
- `query_artists(letter, q, ...)` — Artist tree with pagination
- `query_stats(favorites_only, q, format, ...)` — Library statistics
- `count()` — Total song count

### Library Query Parameters (`/api/library`)

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | str | `""` | Full-text search across title/artist/album |
| `page` | int | `0` | 0-indexed page number |
| `size` | int | `24` | Page size (max 200) |
| `sort` | str | `"artist"` | One of: `artist`, `artist-desc`, `title`, `title-desc`, `recent`, `tuning`, `year`, `year-desc` |
| `favorites` | int | `0` | Boolean — favorites only |
| `format` | str | — | Filter by format: `psarc`, `sloppak`, `loose` |
| `arrangements_has` | str | — | Comma-separated arrangement names (must have ALL) |
| `arrangements_lacks` | str | — | Comma-separated arrangement names (must NOT have) |
| `stems_has` | str | — | Comma-separated stem IDs (must have ALL) |
| `stems_lacks` | str | — | Comma-separated stem IDs (must NOT have) |
| `has_lyrics` | str | — | `"0"` or `"1"` |
| `tunings` | str | — | Comma-separated tuning names |

Returns: `{"songs": [...], "total": N}`

## REST API Endpoints

### Version & Status

#### `GET /api/version`
Returns `{"version": "...", "source_url": "...", "license_url": "..."}`. Reads `$APP_VERSION` env var or `VERSION` file. URL validation via `_safe_http_url()` (rejects non-http schemes, empty hostname).

#### `GET /api/scan-status`
Returns the scanner status dict: `{"stage": "...", "total": N, "done": N, "is_first_scan": bool, "running": bool}`.

#### `GET /api/startup-status`
Returns current startup status: `{"running": bool, "phase": str, "message": str, "error": str|null, "current_plugin": str, "loaded": int, "total": int}`.

#### `GET /api/startup-status/stream`
SSE endpoint. Subscribes to startup status changes. Emits `data: {json}` for each status update, `event: complete` on terminal state.

### Library

#### `GET /api/library`
Paginated song listing with filtering. See query parameters above.

#### `GET /api/library/artists`
Artist tree with nested song counts. Supports letter filter, search, favorites-only, pagination.

#### `GET /api/library/stats`
Library statistics: `{"total": N, "artists": N, "albums": N, "duration": N, "formats": {...}}`.

#### `GET /api/library/tuning-names`
Distinct tuning names with counts. Sorted by distance from E Standard, then by sort key, then alphabetically.

### Scans

#### `POST /api/rescan`
Trigger incremental scan. Returns `202 Accepted`. Scans in background; checks for new/modified files and deleted files. Relies on mtime+size caching.

#### `POST /api/rescan/full`
Trigger full rescan. Same as rescan but ignores mtime/size cache (re-extracts all metadata).

### Songs

#### `GET /api/song/{filename}`
Returns full song metadata (same shape as library entry). Also accepts `?arrangement=N` to get arrangement details.

#### `GET /api/song/{filename}/art`
Serves album art. Dispatches by format:
- **Sloppak**: serves `cover.jpg` (or manifest-declared cover) from source dir
- **Loose folder**: serves discovered art PNG/JPG/WebP
- **PSARC**: reads embedded DDS/PNG/JPG from archive, caches converted PNG

#### `POST /api/song/{filename}/meta`
Update song metadata fields (`title`, `artist`, `album`, `art`). Base64-encoded art overrides the extracted album art.

#### `POST /api/song/{filename}/art/upload`
Upload custom album art for a song. Accepts multipart file upload.

#### `DELETE /api/song/{filename}`
Delete a song file from the DLC directory.

#### `POST /api/songs/upload`
Upload one or more song files via multipart upload. Supports PSARC, sloppak, and loose folders. Accepts overwrite flag.

### Favorites & Loops

#### `POST /api/favorites/toggle`
Body: `{"filename": "..."}`. Returns `{"favorite": bool}`.

#### `GET /api/loops`
Query: `?filename=...`. Returns `[{"id", "name", "start", "end"}]`.

#### `POST /api/loops`
Body: `{"filename", "name", "start", "end"}`. Auto-generates name if empty (`"Loop N"`). Returns `{"ok": true, "name": "..."}`.

#### `DELETE /api/loops/{id}`
Delete a saved loop.

### Settings

#### `GET /api/settings`
Reads `CONFIG_DIR/config.json`. Returns parsed JSON object, or `_default_settings()` on failure.

#### `POST /api/settings`
Partial-update merge. Only keys present in the request body are modified. Validated fields:
- `dlc_dir` — must be valid directory path
- `default_arrangement` — string
- `demucs_server_url` — string (for stem splitting)
- `master_difficulty` — number 0-100 (bool-rejected)
- `av_offset_ms` — number -1000 to 1000 (bool-rejected)
- `psarc_platform` — one of `"both"`, `"pc"`, `"mac"`

Returns `{"message": "..."}` on success, `{"error": "..."}` on validation failure.

#### `GET /api/settings/export`
Builds a settings bundle JSON with version `SETTINGS_BUNDLE_SCHEMA = 1`. Includes:
- `schema` — bundle format version
- `exported_at` — UTC timestamp
- `slopsmith_version` — running version
- `server_config` — contents of config.json
- `plugin_server_configs` — per-plugin file blocks (only files declared in `settings.server_files` manifest field)

Files are encoded as `{"encoding": "json", "data": ...}` for `.json` files (diff-friendly) or `{"encoding": "base64", "data": "..."}` for binary. Symlinks skipped on export.

#### `POST /api/settings/import`
Two-phase import:
1. **Phase 1 (validation)**: validates schema version, server config types, plugin file allowlists, path safety (no absolute paths, no `..`, no backslashes, no symlinks, no undeclared files)
2. **Phase 2 (commit)**: writes validated files via atomic `tempfile.mkstemp` + `os.replace`

Returns `{"ok": true/false, "error": "...", "warnings": [...], "partial": [relpaths...]}`.

### Diagnostics

#### `GET /api/diagnostics/hardware`
Hardware probe: CPU, GPU, RAM, disk. Uses `diagnostics_hardware.py`.

#### `GET /api/diagnostics/preview`
Preview of what `/api/diagnostics/export` would produce. Returns tree of files, sizes, schemas, and redaction counts — no actual file contents.

#### `POST /api/diagnostics/export`
Builds a diagnostic zip bundle. Accepts:
- `redact` (bool, default true) — PII redaction
- `include` (dict) — sections to include: system, hardware, logs, console, plugins
- `client_console` — browser console log snapshot
- `client_hardware` — client-side hardware probe
- `client_ua` — user agent info
- `local_storage` — localStorage snapshot
- `client_contributions` — per-plugin client-side contributions (idempotent, keyed by plugin_id)

Plugin diagnostics via `diagnostics.callable` (e.g. `"diagnostics:collect"`) are resolved lazily and errors are caught and logged to manifest `notes`. Plugin `diagnostics.server_files` allowlist determines which files are included.

Returns `application/zip` with filename `slopsmith-diagnostics-<date>-<time>.zip`.

### Audio

#### `GET /audio/{filename}`
Serves cached audio files from `AUDIO_CACHE_DIR`. Returns MP3/OGG/WAV with correct MIME type and `Content-Length`.

#### `GET /api/audio-local-path`
Electron-only: returns local filesystem path for a given audio URL. Restricted to loopback addresses. Validates URL against directory traversal.

### WebSockets

#### `WS /ws/highway/{filename}`
Main highway data stream. Query param `?arrangement=N` to select arrangement by index.

**Message sequence:**

| Message | Fields | Description |
|---------|--------|-------------|
| `loading` | `{type, stage}` | Progress updates during extraction |
| `song_info` | `{type, title, artist, duration, arrangement, arrangement_index, arrangements, audio_url, audio_error, tuning, stringCount, capo, offset, format, stems, has_drum_tab}` | Song metadata |
| `beats` | `{type, data: [{time, measure}]}` | Beat timestamps |
| `sections` | `{type, data: [{time, name}]}` | Named sections |
| `anchors` | `{type, data: [{time, fret, width}]}` | Fret zoom anchors |
| `chord_templates` | `{type, data: [{name, frets, fingers}]}` | Chord shapes with fingering |
| `lyrics` | `{type, data: [{w, t, d}]}` | Syllable-level lyrics |
| `tone_changes` | `{type, base, data: [{time, name}]}` | Tone changes (optional) |
| `notes` | `{type, data: [{t, s, f, sus, ho, po, sl, bn, ...}]}` | Single notes |
| `chords` | `{type, data: [{t, notes: [{s, f, sus, ...}]}]}` | Chord events |
| `drum_tab` | `{type, version, name, kit, total}` | Drum kit definition (sloppak only) |
| `drum_hits` | `{type, data, total}` | Drum hit events (chunked) |
| `phrases` | `{type, data, total}` | Per-phrase difficulty ladder (chunked, optional) |
| `ready` | `{type: 'ready'}` | All data sent |
| `error` | `{type: 'error', message}` | Fatal error (connection closes) |

#### `WS /ws/retune`
Retune a PSARC to E Standard with progress. Query params: `filename`, `target` (default `"E Standard"`). Only E Standard supported. Sends progress `{stage, progress}` messages, then `{done: true, filename}` or `{error}`.

#### `WS /ws/convert`
PSARC→sloppak conversion with progress. (Provided by sloppak-converter plugin, registered at startup.)

### Plugin Routes

#### `GET /api/plugins`
Returns list of loaded plugins: `[{id, name, type, version, private, has_screen, has_settings, has_routes, nav, error}]`.

#### `GET /api/plugins/{id}/file/{path}`
Serve a file from a plugin's directory. Used for plugin screens and settings HTML.

## Startup Flow

1. `_load_config()` — read config.json, fall back to defaults
2. `configure_logging()` — set up structlog pipeline
3. Generate `_event_loop` reference
4. If `SLOPSMITH_SKIP_STARTUP_TASKS`: set terminal status, clear plugin list, return early
5. Sweep stale temp dirs (PSARC/Demucs staging dirs from prior SIGKILL'd runs)
6. Set startup status to `running`, phase `"starting"`
7. **Load plugins** (async via thread pool):
   - Plugin context: `config_dir`, `get_dlc_dir`, `extract_meta`, `meta_db`, `get_sloppak_cache_dir`, `register_demo_janitor_hook`
   - `_on_progress` callback updates SSE startup status for each plugin
   - `_route_setup_on_main` marshals plugin route registration onto the event loop thread via `call_soon_threadsafe`
   - Errors tracked per-plugin in `_active_errors` dict
   - Startup phase transitions: `"plugins-loading"` → `"plugins-done"` → `"complete"`
8. **Start periodic rescan** (5-minute interval thread)
9. **Kick initial scan** — background thread scans DLC directory
10. **Start demo janitor** (if demo mode) — hourly sweep of stale sessions

## Plugin System

### Discovery
- Scans `plugins/` (builtin) and `SLOPSMITH_PLUGINS_DIR` (user) directories
- Each subdirectory with `plugin.json` is a plugin
- Loaded via `plugins/__init__.py`

### Manifest (`plugin.json`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | str | Unique plugin identifier |
| `name` | str | Display name |
| `version` | str | Semver string |
| `private` | bool | Advisory metadata |
| `type` | str | Role hint: `"visualization"` or absent |
| `nav` | obj | `{label, screen}` for navbar entry |
| `screen` | str | HTML file for plugin screen |
| `script` | str | JS file for plugin screen |
| `routes` | str | Python file with `setup(app, context)` |
| `settings` | obj | Settings HTML + `server_files` allowlist |
| `diagnostics` | obj | `server_files` + `callable` for diagnostics |

### Plugin Context

Passed to `setup(app, context)`:
- `config_dir` — Path
- `get_dlc_dir()` — callable returning Path
- `extract_meta()` — metadata extraction callable
- `meta_db` — MetadataDB instance
- `get_sloppak_cache_dir()` — callable returning Path
- `load_sibling(name)` — namespaced sibling import (bijectively encoded module name)
- `register_demo_janitor_hook(fn)` — register cleanup callback
- `log` — namespaced logging.Logger (`slopsmith.plugin.<id>`)

### Frontend Integration
- `window.slopsmith` event emitter for inter-plugin communication
- `window.registerShortcut()` for keyboard shortcuts
- `window.slopsmithViz_<id>` factory for visualization plugins
- `window.slopsmith.diagnostics.contribute()` for client-side diagnostics
- `window.slopsmith.audio.registerFader()` for audio mixer integration

## Audio Pipeline

### PSARC Audio
1. Extract PSARC to temp directory via `unpack_psarc()`
2. Find WEM files via `find_wem_files()` (scans extracted dir)
3. Convert first WEM via `convert_wem()`:
   - Primary: `vgmstream-cli` + `ffmpeg` (produces MP3)
   - Fallback: pure-Python `wem_decode.py` decoder (produces WAV)
4. Cache converted file to `AUDIO_CACHE_DIR/audio_{audio_id}.mp3`
5. Cache eviction: LRU on atime, max 100 files

### Sloppak Audio
- Stems served via `/api/sloppak/{filename}/file/{relpath}`
- Default stem (first or explicit) serves as `<audio>` source
- Stems plugin replaces default with mixed graph

### Audio Cache
- `AUDIO_CACHE_DIR = CONFIG_DIR / audio_cache`
- Naming: `audio_{audio_id}{ext}` where audio_id is the filename stem
- Eviction: when >100 files, delete oldest by atime

## Song Format Handling

### PSARC (`.psarc`)
- Header: magic `"PSAR"`, version, TOC length, entry count, block size
- Encryption: AES-CFB with Rocksmith key `{0x77,0x38,0x5e,0x9e,0xa8,0xf5,0xf1,0x51,0x2e,0x73,0xd7,0xd0,0x74,0x44,0x88,0x49}` and IV `{0x29,0x2e,0x6f,0x54,0x56,0x42,0x49,0x28,0x3c,0x33,0x34,0x3d,0x37,0x52,0x47,0x7a}`
- Compression: zlib per-block
- Entries: filenames with MD5 hash, block offsets, compressed/uncompressed sizes
- Metadata extraction: reads `manifests/**/*.json` for quick scanning without full extract
- Full extraction: `unpack_psarc()` decrypts + decompresses all entries to temp dir
- Audio extraction: finds WEM files in `audio/windows/`

### Sloppak (`.sloppak`)
- Open format: zip archive or directory
- Manifest: `manifest.yaml` — song metadata, arrangement IDs, stem list
- Arrangements: `arrangements/{id}.json` in wire format
- Audio: `stems/full.ogg` (mixed), optional split stems
- Art: `cover.jpg`
- Drum tab: optional `drum_tab` key in manifest

### Loose Folder
- Flat directory of Rocksmith XML files + `audio.wem`
- Detected by `loosefolder.py` — presence of arrangement XMLs
- Audio conversion via same pipeline as PSARC

## Metadata Extraction

### `_extract_meta_fast(psarc_path)` — PSARC quick scan
1. Read JSON manifests from PSARC via `read_psarc_entries(filepath, ["**/*.json"])`
2. Parse manifest entries for: SongName, ArtistName, AlbumName, SongYear, SongLength, ArrangementName, Tuning (string0..string5)
3. Resolve tuning offsets to human-readable name via `tuning_name(offsets)`
4. Return `{title, artist, album, year, duration, tuning, tuning_name, tuning_sort_key, arrangements, has_lyrics, format, stems}`

### `_extract_meta_sloppak(path)` — Sloppak metadata
1. Read `manifest.yaml` from archive or directory
2. Extract same fields as PSARC metadata

### `_extract_meta_loosefolder(path)` — Loose folder metadata
1. Parse arrangement XMLs from the directory
2. Extract metadata from `<song>` root element (title, artistName, etc.)
3. Note: loose folder XMLs store metadata as child elements, not attributes

### Background Scanner
- Runs in a background thread (`_scan_runner`)
- Iterates DLC directory, extracts metadata, caches in DB
- Handles PSARC, sloppak, and loose folders
- Incremental scans skip unchanged files (mtime+size check)
- Full scans re-extract everything
- Updates scan status through shared dict

## Demo Mode

When `SLOPSMITH_DEMO_MODE` is set:
- `_demo_mode_guard` middleware intercepts all requests
- Every 60 minutes, `_demo_janitor` sweeps plugin session stores
- Plugins register cleanup hooks via `register_demo_janitor_hook()`
- Both sync and async callables supported (sync only for janitor)

## Logging

- `configure_logging()` in `logging_setup.py`
- Primary logger: `structlog` with JSON format
- Correlation IDs via `structlog.contextvars` bound per-request or per-WebSocket connection
- WebSocket connections get a `ws_conn_id` (8-char hex UUID)
- Pino-compatible output format configurable

## Error Handling

- File not found → `{"error": "not found"}` with 404
- Path traversal → `{"error": "forbidden"}` with 403
- Missing DLC dir → `{"error": "DLC folder not configured"}`
- No arrangements → `{"error": "No arrangements found"}`
- All unexpected exceptions caught at route level with `log.exception()`

## Shutdown Sequence

1. Stop the periodic rescan thread
2. Stop the demo janitor thread (if running)
3. Plugin cleanup (the `_event_loop` reference is kept alive for plugin teardown)

## Key Design Decisions

- **Single-process**: all state in memory, no separate worker processes
- **Thread-based background work**: scans, plugin loading, retune run in threads with `call_soon_threadsafe` for event-loop coordination
- **In-memory DB**: SQLite on disk CONFIG_DIR/meta.db, no connection pooling
- **Atomic file writes**: settings import uses `mkstemp` + `os.replace`
- **No authentication**: single-user design
- **Keepalive**: highway WebSocket sends `{"type":"loading","stage":"Loading..."}` every 3s during extraction to prevent proxy timeouts
- **Audio cache LRU**: atime-based eviction at 100 files, checked per conversion
- **Path safety**: layered defense — string-level rejection of `..`/`.` segments, allowlist matching, `resolve()` containment check, component-by-component symlink probe
