# Backend Verification Survey

> Checklist to verify the new TypeScript/Fastify backend (`backend/src/`) matches the legacy Python/FastAPI backend (`legacy/server.py`) in behavior. Each item describes what the legacy backend does, what to check in the new backend, and how to test.

---

## 1. Configuration & Startup

### 1.1 Environment Variables

| # | Check | Legacy Behavior | New Backend | Test |
|---|-------|-----------------|-------------|------|
| 1.1.1 | `DLC_DIR` | `~/.local/share/rocksmith-cdlc` default | via Zod schema | Set empty, verify default |
| 1.1.2 | `CONFIG_DIR` | `~/.local/share/rocksmith-cdlc` default | match | Set env, verify derived paths |
| 1.1.3 | `PORT` | 8080 default | match | Override, verify listen |
| 1.1.4 | `HOST` | `0.0.0.0` default | match | Override, verify bind |
| 1.1.5 | `LOG_LEVEL` | `info` default | match | Override, verify output |
| 1.1.6 | `LOG_PRETTY` | `false` default | match | Set true, verify format |
| 1.1.7 | `APP_SOURCE_URL` | defaults to GitHub URL with http(s) validation | match | Verify unsafe URLs rejected |
| 1.1.8 | `APP_LICENSE_URL` | defaults to `<source_url>/blob/main/LICENSE` | match | Override, verify |
| 1.1.9 | `SLOPSMITH_DEMO_MODE` | enables demo guard middleware | match | Set, verify middleware |
| 1.1.10 | `SLOPSMITH_PLUGINS_DIR` | extra plugin directory | match | Set, verify discovery |
| 1.1.11 | `ELECTRON_MODE` | — (not in legacy) | new | Verify audio-local-path restricted to loopback |

### 1.2 Startup Sequence

| # | Check | Legacy | Test |
|---|-------|--------|------|
| 1.2.1 | SPA catch-all serves index.html for unmatched GET routes | Yes | `GET /some/nonexistent/route` → index.html |
| 1.2.2 | CORS enabled with `origin: true` | Yes | Verify CORS headers |
| 1.2.3 | Correlation ID header on every response | Yes (`x-correlation-id`) | Verify header present |
| 1.2.4 | Error handler catches unhandled exceptions | Yes (log.exception + 500) | Trigger internal error, verify safe response |
| 1.2.5 | Static files served at `/static/` | Yes | `GET /static/somefile` |
| 1.2.6 | Plugin discovery runs at startup | Yes | Check `/api/plugins` returns loaded plugins |
| 1.2.7 | Background library scan kicks on startup | Yes | Check `/api/scan-status` after startup |

---

## 2. REST API Endpoints

### 2.1 Version & Status

| # | Endpoint | Legacy Behavior | New Backend | Test |
|---|----------|-----------------|-------------|------|
| 2.1.1 | `GET /api/version` | Returns `{version, source_url, license_url}` | match | Verify shape and values |
| 2.1.2 | `GET /api/scan-status` | Returns `{stage, total, done, is_first_scan, running}` | match | Verify after scan completes |
| 2.1.3 | `GET /api/startup-status` | Returns `{running, phase, message, error, current_plugin, loaded, total}` | match | Verify at various startup phases |
| 2.1.4 | `GET /api/startup-status/stream` | SSE stream of status updates | should match | Verify event stream |

### 2.2 Library

| # | Endpoint | Legacy Behavior | New Backend | Test |
|---|----------|-----------------|-------------|------|
| 2.2.1 | `GET /api/library` | Paginated, filtered song listing. 0-indexed page. | page schema uses `min(0)` but maps `page: q.page \|\| 1` | Verify page 0 returns first page |
| 2.2.2 | `GET /api/library` — `sort=artist` | Sorts by artist ASC | match | Verify ordering |
| 2.2.3 | `GET /api/library` — `sort=artist-desc` | Sorts by artist DESC | match | Verify ordering |
| 2.2.4 | `GET /api/library` — `sort=title` | Sorts by title ASC | match | Verify ordering |
| 2.2.5 | `GET /api/library` — `sort=title-desc` | Sorts by title DESC | match | Verify ordering |
| 2.2.6 | `GET /api/library` — `sort=recent` | Sorts by mtime DESC (most recent first) | match | Verify ordering |
| 2.2.7 | `GET /api/library` — `sort=tuning` | Sorts by distance from E Standard | match | Verify ordering |
| 2.2.8 | `GET /api/library` — `sort=year` | Sorts by year ASC | match | Verify ordering |
| 2.2.9 | `GET /api/library` — `sort=year-desc` | Sorts by year DESC | match | Verify ordering |
| 2.2.10 | `GET /api/library` — `favorites=1` | Favorites only | match | Toggle favorite, verify filter |
| 2.2.11 | `GET /api/library` — `format=psarc` | Filter by format | match | Verify |
| 2.2.12 | `GET /api/library` — `format=sloppak` | Filter by format | match | Verify |
| 2.2.13 | `GET /api/library` — `format=loose` | Filter by format | match | Verify |
| 2.2.14 | `GET /api/library` — `q=` | Full-text search across title/artist/album | match | Verify search |
| 2.2.15 | `GET /api/library` — `arrangements_has=` | Comma-separated, must have ALL | match | Verify AND semantics |
| 2.2.16 | `GET /api/library` — `arrangements_lacks=` | Comma-separated, must NOT have | match | Verify |
| 2.2.17 | `GET /api/library` — `has_lyrics=1` | Only songs with lyrics | match | Verify |
| 2.2.18 | `GET /api/library` — `tunings=` | Comma-separated tuning names | match | Verify |
| 2.2.19 | `GET /api/library` — Response shape | `{songs: [...], total: N}`. Songs have `tuningName` (camelCase) | match | Verify field naming |
| 2.2.20 | `GET /api/library` — `tuningName` | Human-readable from `tuning_name()` — "E Standard", "Eb Standard", "Drop D" | match | Verify all tuning names resolve |
| 2.2.21 | `GET /api/library` — `tuningSortKey` | Integer for musical ordering | match | Verify values |
| 2.2.22 | `GET /api/library/artists` | Artist tree with pagination, letter filter, search | match | Verify structure |
| 2.2.23 | `GET /api/library/stats` | `{total, artists, albums, duration, formats}` | match | Verify counts |
| 2.2.24 | `GET /api/library/tuning-names` | `{tunings: [{name, sort_key, count}]}` sorted by musical distance | match | Verify order and count |

### 2.3 Scans

| # | Endpoint | Legacy Behavior | New Backend | Test |
|---|----------|-----------------|-------------|------|
| 2.3.1 | `POST /api/rescan` | Returns 202, scans incrementally in background | match | Verify 202 and background execution |
| 2.3.2 | `POST /api/rescan/full` | Returns 202, re-extracts all metadata | match | Verify ignores cache |
| 2.3.3 | Scan detects new files | Scans DLC dir, adds to DB | match | Add file, rescan, verify in library |
| 2.3.4 | Scan detects deleted files | Removes from DB | match | Delete file, rescan, verify removed |
| 2.3.5 | Scan detects modified files | Re-extracts metadata on mtime+size change | match | Touch file, rescan, verify updated |
| 2.3.6 | Filenames stored relative | `path.relative(dlcDir, filePath)` | match | Verify in DB |

### 2.4 Songs

| # | Endpoint | Legacy Behavior | New Backend | Test |
|---|----------|-----------------|-------------|------|
| 2.4.1 | `GET /api/song/{filename}` | Returns full metadata | match | Verify shape |
| 2.4.2 | `GET /api/song/{filename}/art` | Returns PNG (converted from DDS if needed) | match | Verify Content-Type and cache |
| 2.4.3 | `POST /api/song/{filename}/meta` | Update title/artist/album/art fields | match | Verify update |
| 2.4.4 | `POST /api/song/{filename}/art/upload` | Upload custom album art | match | Verify upload + retrieval |
| 2.4.5 | `DELETE /api/song/{filename}` | Delete file from DLC dir | match | Verify file removed |
| 2.4.6 | `POST /api/songs/upload` | Upload song files via multipart | match | Verify file saved to DLC dir |
| 2.4.7 | `GET /api/song/{filename}/art` — Sloppak | Serves cover.jpg from source dir | match | Test with sloppak |
| 2.4.8 | `GET /api/song/{filename}/art` — PSARC | Extracts from archive, caches PNG | match | Test with fresh PSARC (no cached art) |
| 2.4.9 | `/api/sloppak/{filename}/file/{relPath}` | Serves sloppak internal files | match | Verify MIME types |

### 2.5 Favorites & Loops

| # | Endpoint | Legacy Behavior | New Backend | Test |
|---|----------|-----------------|-------------|------|
| 2.5.1 | `POST /api/favorites/toggle` | Toggle favorite, return new state | match | Verify toggle + response |
| 2.5.2 | `GET /api/loops` | List loops for a filename | match | Verify |
| 2.5.3 | `POST /api/loops` | Save loop, auto-generate name | match | Verify save + auto-name |
| 2.5.4 | `DELETE /api/loops/{id}` | Delete loop by id | match | Verify deletion |

### 2.6 Settings

| # | Endpoint | Legacy Behavior | New Backend | Test |
|---|----------|-----------------|-------------|------|
| 2.6.1 | `GET /api/settings` | Read config.json, return merged defaults | match | Verify shape |
| 2.6.2 | `POST /api/settings` | Partial update — only specified keys change | match | Single-key POST, verify other keys preserved |
| 2.6.3 | `POST /api/settings` — `dlc_dir` | Must be valid directory | match | Invalid path → error |
| 2.6.4 | `POST /api/settings` — `master_difficulty` | Clamp 0-100, reject bool | match | Test edge cases |
| 2.6.5 | `POST /api/settings` — `av_offset_ms` | Clamp -1000 to 1000, reject bool | match | Test edge cases |
| 2.6.6 | `POST /api/settings` — `psarc_platform` | Must be "both", "pc", or "mac" | match | Test invalid values |
| 2.6.7 | `GET /api/settings/export` | JSON bundle with schema version, server_config, plugin configs | match | Verify bundle shape |
| 2.6.8 | `POST /api/settings/import` | Two-phase: validate then atomic write | match | Verify phase 1 validates without writing, phase 2 commits atomically |
| 2.6.9 | `POST /api/settings/import` — schema version check | Rejects unknown schema | match | Test version mismatch |
| 2.6.10 | `POST /api/settings/import` — symlink rejection | Refuses symlinked relpaths | match | Test with symlink |
| 2.6.11 | `POST /api/settings/import` — undeclared file | Skips files not in plugin manifest | match | Test with extra file |
| 2.6.12 | `POST /api/settings/import` — path traversal | Rejects `..`, absolute paths, backslashes | match | Test malicious input |

### 2.7 Diagnostics

| # | Endpoint | Legacy Behavior | New Backend | Test |
|---|----------|-----------------|-------------|------|
| 2.7.1 | `GET /api/diagnostics/hardware` | CPU, GPU, RAM, disk probe | stub | Verify returns data |
| 2.7.2 | `GET /api/diagnostics/preview` | File tree + sizes + redaction counts (no content) | stub | Verify structure |
| 2.7.3 | `POST /api/diagnostics/export` | Full zip bundle with system/hardware/logs/console/plugins | stub | Verify returns valid zip |

### 2.8 Plugins

| # | Endpoint | Legacy Behavior | New Backend | Test |
|---|----------|-----------------|-------------|------|
| 2.8.1 | `GET /api/plugins` | List loaded plugins with metadata | match | Verify shape |
| 2.8.2 | `GET /api/plugins/{id}/file/{path}` | Serve plugin file | match | Verify |
| 2.8.3 | Plugin route registration | Plugins register FastAPI routes at startup via `setup(app, context)` | NOT IMPLEMENTED | Plugin routes must load at startup |

### 2.9 Audio

| # | Endpoint | Legacy Behavior | New Backend | Test |
|---|----------|-----------------|-------------|------|
| 2.9.1 | `GET /audio/{filename}` | Serves cached audio with proper MIME type + Content-Length | match | Verify cached file serves |
| 2.9.2 | `GET /audio/{filename}` — missing | Returns 404 | match | Non-existent file |
| 2.9.3 | `GET /api/audio-local-path` | Electron-only, loopback-restricted | match | Test from remote IP → 403 |

### 2.10 WebSocket — Highway

| # | Check | Legacy Behavior | New Backend | Test |
|---|-------|-----------------|-------------|------|
| 2.10.1 | `WS /ws/highway/{filename}` — extraction | Sends `{type: "loading", stage: "Extracting..."}` first | match | Verify first message |
| 2.10.2 | Keepalive during extraction | Sends `{type: "loading", stage: "Loading..."}` every 3s | match | Verify keepalive during long extraction |
| 2.10.3 | `song_info` — title/artist/duration | From XML child elements OR JSON manifests | match | Verify for both attribute-style and element-style XML |
| 2.10.4 | `song_info` — arrangement selection | Explicit index > user preference (default_arrangement) > most notes | match | Test each path |
| 2.10.5 | `song_info` — `stringCount` | `arrangement_string_count()` — combines notes-derived bound, name fallback, tuning length | match | Test with bass (4), guitar (6), extended-range (7+) |
| 2.10.6 | `song_info` — `offset` | `_sanitized_song_offset()` guards against NaN from loose charts | match | Test with NaN offset |
| 2.10.7 | `song_info` — `format` | `"psarc"`, `"sloppak"`, or `"loose"` | match | Test each format |
| 2.10.8 | `song_info` — `stems` | Array of `{id, url, default}` for sloppak | match | Test sloppak with stems |
| 2.10.9 | `song_info` — `has_drum_tab` | Bool, true when sloppak has drum_tab | match | Test sloppak with drum tab |
| 2.10.10 | `song_info` — `audio_error` | Non-null when audio unavailable | match | Test song with missing audio |
| 2.10.11 | `beats` message | `{type: "beats", data: [{time, measure}]}` | match | Verify shape |
| 2.10.12 | `sections` message | `{type: "sections", data: [{time, name}]}` | match | Verify shape |
| 2.10.13 | `anchors` message | `{type: "anchors", data: [{time, fret, width}]}` | match | Verify shape |
| 2.10.14 | `chord_templates` message | `{name, frets: [6], fingers: [6]}`. `fingers`: -1 unused, 0 open, >0 finger. | match | Verify fingering arrays |
| 2.10.15 | `lyrics` message | `{type: "lyrics", data: [{w, t, d}]}` | match | Verify shape |
| 2.10.16 | `tone_changes` message | `{type: "tone_changes", base, data: [{time, name}]}` | match | Only if tones found |
| 2.10.17 | `notes` message | `{type: "notes", data: [{t, s, f, sus, ho, po, sl, bn, ...}]}` | match | Verify wire format |
| 2.10.18 | `chords` message | `{type: "chords", data: [{t, notes: [{s, f, sus, ...}]}]}` | match | Verify wire format |
| 2.10.19 | `drum_tab` message | `{type: "drum_tab", version, name, kit, total}` (sloppak only) | match | Verify with drum sloppak |
| 2.10.20 | `drum_hits` message | `{type: "drum_hits", data, total}` (chunked 500) | match | Verify chunking |
| 2.10.21 | `phrases` message | `{type: "phrases", data, total}` (chunked, optional) | match | Verify when phrases available |
| 2.10.22 | `ready` message | `{type: "ready"}` — signals all data sent | match | Verify it's the last message |
| 2.10.23 | Error handling | Missing DLC → `{"error": "DLC folder not configured"}` | match | Test |
| 2.10.24 | Error handling | File not found → `{"error": "File not found"}` | match | Test |
| 2.10.25 | Error handling | No arrangements → `{"error": "No arrangements found"}` | match | Test |
| 2.10.26 | Error handling | Path traversal → `{"error": "forbidden"}` | match | Test |
| 2.10.27 | Song cache | Extraction cache avoids re-extracting same song in same session | match | Verify second request served from cache |

### 2.11 WebSocket — Retune

| # | Check | Legacy Behavior | New Backend | Test |
|---|-------|-----------------|-------------|------|
| 2.11.1 | `WS /ws/retune` | Query params: `filename`, `target` | Query params | Verify connection |
| 2.11.2 | Retune progress | Streams `{stage, progress}` then `{done: true, filename}` | match | Verify progress messages |
| 2.11.3 | Unsupported target | Only E Standard supported | match | Test with Drop D → error |
| 2.11.4 | Sloppak rejection | `.sloppak` files rejected with error | match | Test |
| 2.11.5 | New file cached | Metadata extracted and cached for new file | match | Verify file appears in library |

### 2.12 WebSocket — Convert

| # | Check | Legacy | New Backend | Test |
|---|-------|--------|-------------|------|
| 2.12.1 | `WS /ws/convert` | PSARC→sloppak conversion progress | NOT IMPLEMENTED | File as gap |

---

## 3. Plugin System

| # | Check | Legacy | New Backend | Test |
|---|-------|--------|-------------|------|
| 3.1 | Plugin manifest discovery | Scans `plugins/` + `SLOPSMITH_PLUGINS_DIR` for `plugin.json` | match | Verify both dirs scanned |
| 3.2 | Plugin manifest validation | Reads id, name, type, nav, screen, script, routes, settings, diagnostics | match | Verify validation |
| 3.3 | `setup(app, context)` call | Each plugin's `routes.py:setup()` called with context | NOT IMPLEMENTED | Plugin routes not loaded |
| 3.4 | Plugin context — `config_dir` | Path to persistent config | match | Verify |
| 3.5 | Plugin context — `get_dlc_dir()` | Callable returning DLC path | match | Verify |
| 3.6 | Plugin context — `extract_meta()` | Metadata extraction callable | match | Verify |
| 3.7 | Plugin context — `meta_db` | Database instance | match | Verify |
| 3.8 | Plugin context — `get_sloppak_cache_dir()` | Callable | match | Verify |
| 3.9 | Plugin context — `load_sibling(name)` | Namespaced sibling import | NOT IMPLEMENTED | Verify |
| 3.10 | Plugin context — `log` | Namespaced logger | match | Verify |
| 3.11 | Plugin error tracking | Errors tracked per-plugin, surfaced in `/api/plugins` and startup status | match | Verify |
| 3.12 | Plugin settings `server_files` | Allowlist for settings export/import | match | Verify allowlist semantics |
| 3.13 | Plugin diagnostics `callable` | Lazy-resolved function for diagnostics bundle | match | Verify |
| 3.14 | Plugin dependencies | `pip install` for plugin requirements | NOT IMPLEMENTED | Verify |
| 3.15 | Nav entries | Plugins with `nav` field get navbar entries | match | Verify frontend rendering |

---

## 4. Audio Pipeline

| # | Check | Legacy Behavior | New Backend | Test |
|---|-------|-----------------|-------------|------|
| 4.1 | WEM detection | `find_wem_files()` scans extracted dir for `.wem` files | match | Verify |
| 4.2 | WEM conversion | `convert_wem()` via vgmstream-cli + ffmpeg | match | Verify produces playable MP3 |
| 4.3 | Audio cache naming | `audio_{audio_id}.mp3` | match | Verify filename convention |
| 4.4 | Audio cache location | `CONFIG_DIR / audio_cache` | match | Verify |
| 4.5 | Cache eviction | LRU atime-based, max 100 files | match | Verify eviction |
| 4.6 | On-demand conversion | Converts on first play, caches result | match | Verify first play + subsequent serve |
| 4.7 | Loose folder audio | Hashes canonical path + wem mtime/size for cache key | match | Verify invalidation on wem change |
| 4.8 | PSARC audio | Extracts WEM, converts, caches to `audio_cache` | match | Verify complete flow |
| 4.9 | Sloppak audio | Serves stems via `/api/sloppak/{filename}/file/{relpath}` | match | Verify |
| 4.10 | Audio file path safety | Rejects `..`, absolute paths, backslashes | match | Verify |
| 4.11 | MIME types | `.mp3` → `audio/mpeg`, `.ogg` → `audio/ogg`, etc. | match | Verify each |

---

## 5. Metadata Extraction

### 5.1 PSARC Metadata

| # | Check | Legacy | New Backend | Test |
|---|-------|--------|-------------|------|
| 5.1.1 | Header parsing | Magic "PSAR", version, TOC length, entry count, block size | match | Verify header |
| 5.1.2 | TOC parsing | Filenames, MD5 hashes, block offsets, sizes | match — offset fixed | Verify |
| 5.1.3 | Decryption | AES-CFB with Rocksmith key/IV | match | Verify |
| 5.1.4 | Decompression | zlib per-block decompression | match | Verify |
| 5.1.5 | Quick metadata scan | Reads `manifests/**/*.json` via `read_psarc_entries(filepath, ["**/*.json"])` without full extract | match | Verify glob pattern finds nested manifests |
| 5.1.6 | Manifest JSON parsing | Extracts SongName, ArtistName, AlbumName, SongYear, SongLength, ArrangementName, Tuning (string0..string5) | match | Verify field extraction |
| 5.1.7 | Tuning name resolution | `tuning_name(offsets)` — "E Standard", "Eb Standard", "Drop D", "C Standard", etc. | match | Verify all imported tunings resolve |
| 5.1.8 | Arrangement dedup | `seenArrNames` set prevents duplicate arrangement listings | match | Verify |
| 5.1.9 | SNG file parsing (full extract) | `load_song()` parses arrangement XMLs from extracted PSARC | via `loadSongFromDirectory()` | Verify XML parsing |

### 5.2 Sloppak Metadata

| # | Check | Legacy | New Backend | Test |
|---|-------|--------|-------------|------|
| 5.2.1 | Manifest parsing | `manifest.yaml` — YAML with song metadata, arrangement IDs | match | Verify |
| 5.2.2 | Arrangement loading | Wire-format JSON from `arrangements/{id}.json` | match | Verify |
| 5.2.3 | Stem discovery | Stem files from manifest stem list | match | Verify |
| 5.2.4 | Drum tab | Optional `drum_tab` manifest key | match | Verify |

### 5.3 Loose Folder Metadata

| # | Check | Legacy | New Backend | Test |
|---|-------|--------|-------------|------|
| 5.3.1 | Loose folder detection | Presence of arrangement XML files | match | Verify |
| 5.3.2 | XML arrangement parsing | `<song>` element with notes, chords, tuning, etc. | match | Verify |
| 5.3.3 | XML metadata — element form | `<title>`, `<artistName>`, `<songLength>` as child elements | FIXED — `num()`/`str()` now check `el[key]` fallback | Verify with both element-style and attribute-style XML |
| 5.3.4 | XML metadata — attribute form | `<song title="..." artistName="...">` as attributes | match | Verify backward compat |

---

## 6. Database

| # | Check | Legacy | New Backend | Test |
|---|-------|--------|-------------|------|
| 6.1 | Backend storage | SQLite at `CONFIG_DIR/meta.db` | Prisma-managed SQLite `web_library.db` | Verify DB location |
| 6.2 | Songs table columns | `filename`, `mtime`, `size`, `title`, `artist`, `album`, `year`, `duration`, `tuning`, `arrangements` (JSON), `has_lyrics`, `format`, `stem_count`, `stem_ids`, `tuning_name`, `tuning_sort_key` | match via Prisma schema | Verify column coverage |
| 6.3 | Favorites table | `filename TEXT PRIMARY KEY` | match | Verify |
| 6.4 | Loops table | `id` (autoincrement), `filename`, `name`, `start_time`, `end_time` | match | Verify |
| 6.5 | Metadata caching | `get()` returns cached row when mtime+size match | match | Verify |
| 6.6 | Thread safety | `threading.Lock` on all writes | match (Prisma handles concurrency) | Verify |
| 6.7 | Scanner deletion | `delete_missing()` removes rows for files no longer on disk | match | Verify |

---

## 7. Song Model / Wire Format

| # | Check | Legacy (`song.py`) | New (`domain/models/song.ts`) | Test |
|---|-------|--------------------|-------------------------------|------|
| 7.1 | `note_to_wire()` | `{t, s, f, sus, ho, po, sl, bn, ...}` | match | Verify field mapping |
| 7.2 | `chord_to_wire()` | `{t, notes: [{s, f, sus, ...}]}` | match | Verify |
| 7.3 | `anchor_to_wire()` | `{time, fret, width}` | match | Verify |
| 7.4 | `chord_template_to_wire()` | `{name, frets, fingers}` | match | Verify |
| 7.5 | `arrangement_string_count()` | Combines max-string+1, name fallback (4 for bass), tuning length | match | Verify |
| 7.6 | `phrase_to_wire()` | `{start_time, end_time, max_difficulty, levels}` | match | Verify |

---

## 8. Error Handling & Security

| # | Check | Legacy | New Backend | Test |
|---|-------|--------|-------------|------|
| 8.1 | Path traversal protection | `_resolve_dlc_path()` rejects paths outside DLC dir | match via `resolve()` containment | Test `../../../etc/passwd` |
| 8.2 | Path traversal — audio | Rejects `..`, `/` prefixes, `\\` | match | Test |
| 8.3 | Settings import — symlink protection | Component-by-component `lstat` probe | NOT IMPLEMENTED | Verify |
| 8.4 | Settings import — undeclared file check | Only files in plugin manifest allowlist accepted | NOT IMPLEMENTED | Verify |
| 8.5 | Settings export — symlink skip | `os.walk(followlinks=False)` + extra islink check | NOT IMPLEMENTED | Verify |
| 8.6 | NaN guard in highway | `_sanitized_song_offset()` prevents NaN in JSON | match | Test with NaN |
| 8.7 | Booleans rejected for numeric settings | `master_difficulty` and `av_offset_ms` reject `true`/`false` | match | Test |
| 8.8 | URL validation for source/license | `_safe_http_url()` requires scheme + non-empty hostname | match via Zod `.url()` | Test edge cases |

---

## 9. Demo Mode

| # | Check | Legacy | New Backend | Test |
|---|-------|--------|-------------|------|
| 9.1 | Demo guard middleware | Intercepts all requests when enabled | match | Set env, verify |
| 9.2 | Janitor thread | Hourly sweep of plugin session stores | stub | Verify |
| 9.3 | `register_demo_janitor_hook()` | Plugin-facing API for cleanup registration | NOT IMPLEMENTED | Verify |

---

## 10. Startup Status & SSE

| # | Check | Legacy | New Backend | Test |
|---|-------|--------|-------------|------|
| 10.1 | `GET /api/startup-status` | Live snapshot of startup state | match | Verify after restart |
| 10.2 | `GET /api/startup-status/stream` | SSE events for each state transition | match | Read event stream |
| 10.3 | Plugin loading reported | Per-plugin progress via `_on_progress` | match | Verify plugin status updates |
| 10.4 | Error tracking | `_active_errors` dict preserves most recent error per-plugin | match | Verify plugin failure visible |

---

## 11. Testing Infrastructure

| # | Check | Legacy | New Backend | Test |
|---|-------|--------|-------------|------|
| 11.1 | Test framework | pytest, 34 test files | Vitest, 17 test files | Verify coverage gap |
| 11.2 | SLOPSMITH_SKIP_STARTUP_TASKS | Escape hatch for tests | match | Verify |
| 11.3 | PSARC round-trip tests | Create PSARC, extract, verify metadata | TBD | Verify |
| 11.4 | Sloppak round-trip tests | Create sloppak, load, verify data | TBD | Verify |
| 11.5 | Tuning name tests | All named tunings resolve correctly | TBD | Verify |

---

## Summary of Gaps

Items marked **NOT IMPLEMENTED** in the new TypeScript backend:

| # | Feature | Impact |
|---|---------|--------|
| S1 | Plugin route loading (`setup(app, context)`) | Plugin backend routes don't work |
| S2 | `load_sibling()` for collision-free imports | Plugin sibling imports may collide |
| S3 | Plugin `pip` dependency installation | Plugin requirements must be pre-installed |
| S4 | `WS /ws/convert` (PSARC→sloppak) | No conversion progress |
| S5 | Settings export/import — symlink protection | Import could follow symlinks |
| S6 | Settings export/import — undeclared file check | Allowlist not enforced on import |
| S7 | Diagnostics — full zip bundle | Hardware probe, preview, and export are stubs |
| S8 | Diagnostics — plugin `callable` loading | Plugin diagnostics callables can't register |
| S9 | Diagnostics — plugin `server_files` | Plugin files not included in bundle |
| S10 | Demo janitor + `register_demo_janitor_hook()` | Demo mode session cleanup not available |
| S11 | Audio cache eviction | LRU eviction at 100 files not implemented |
| S12 | Keepalive during highway extraction | No keepalive messages during long extraction |

Items marked **FIXED** during initial verification:

| # | Fix | Detail |
|---|-----|--------|
| F1 | PSARC header offset | `tocLength` was reading compression name string instead of TOC length at offset 12 |
| F2 | XML metadata parsing | `num()`/`str()` helpers now check both attribute (`@_key`) and element (`key`) forms |
| F3 | Tuning name display | Library API now returns `tuningName` (camelCase) matching frontend expectation |
| F4 | Audio streaming | Replaced `reply.sendFile()` with streaming `createReadStream()` |
