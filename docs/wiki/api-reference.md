# API Reference

All endpoints are served by the Fastify backend on port **8085** (proxied through port 8006 in the default Docker setup). Unless stated otherwise, endpoints that modify data require authentication.

**Authentication**: Include `Authorization: Bearer {token}` on every authenticated request. For WebSocket upgrades, use `?token={token}` as a query parameter.

---

## Authentication

### Login

`POST /api/auth/login`

```json
{ "profileName": "Alice", "pin": "1234" }
```

**Response 200**
```json
{
  "token": "uuid",
  "expiresAt": 1748563200000,
  "profile": { "id": 1, "name": "Alice", "avatarId": 0 }
}
```

**Response 401** — wrong PIN or account locked.

---

### Logout

`POST /api/auth/logout` — Auth required

Invalidates the current token. Returns `204 No Content`.

---

### Get Session

`GET /api/auth/session` — Auth required

```json
{
  "session": { "token": "...", "profileId": 1, "expiresAt": 1748563200000 },
  "profile": { "id": 1, "name": "Alice" }
}
```

---

### Account Recovery

`POST /api/auth/recover`

```json
{ "name": "Alice", "recoveryPhrase": "blue sky 42", "newPin": "5678" }
```

Returns the updated profile on success, `401` if phrase is wrong.

---

## Profiles

### List Profiles

`GET /api/profiles` — No auth

Returns all profiles (safe fields only — no PIN data).

---

### Get Profile

`GET /api/profiles/:id` — No auth

---

### Create Profile

`POST /api/profiles` — Requires `ADMIN`

```json
{
  "name": "Bob",
  "pin": "0000",
  "recoveryPhrase": "my phrase",
  "recoveryPhraseHint": "favourite colour + number",
  "avatarId": 2
}
```

---

### Update Profile

`PATCH /api/profiles/:id` — Requires `ADMIN`

Partial update — send only the fields to change.

---

### Delete Profile

`DELETE /api/profiles/:id` — Requires `ADMIN`

Deletes the profile and invalidates all its sessions. Returns `204`.

---

## Library

### Search Songs

`GET /api/library`

| Parameter | Type | Description |
|---|---|---|
| `q` | string | Full-text search (artist, title, album) |
| `page` | int | Page (0-indexed, default 0) |
| `size` | int | Per page (max 200, default 50) |
| `sort` | string | `artist` \| `artist-desc` \| `title` \| `title-desc` \| `recent` \| `tuning` \| `year` \| `year-desc` |
| `format` | string | `psarc` \| `sloppak` \| `loose` |
| `arrangements_has` | string[] | Must include these parts (Lead, Rhythm, Bass, Combo) |
| `arrangements_lacks` | string[] | Must not include these parts |
| `stems_has` | string[] | Must include these stems (guitar, bass, drums, vocals) |
| `stems_lacks` | string[] | Must not include these stems |
| `has_lyrics` | bool | Only songs with lyrics |
| `tunings` | string[] | Filter by tuning names |
| `favorites` | bool | Only favourites for the current profile |

**Response**
```json
{ "songs": [ SongMeta ], "total": 452, "page": 0, "size": 50 }
```

---

### Artists Tree

`GET /api/library/artists`

Returns songs grouped by first letter then artist name.

---

### Library Stats

`GET /api/library/stats`

```json
{ "totalSongs": 452, "totalArtists": 87, "letters": { "A": 34, "B": 21 } }
```

---

### Tuning Names

`GET /api/library/tuning-names`

```json
[{ "name": "E Standard", "count": 312 }, ...]
```

---

### Trigger Scan

`POST /api/rescan` — Auth required

Starts an incremental scan (skips unchanged files). Returns `202 Accepted`.

`POST /api/rescan/full` — Auth required

Re-processes all files. Returns `202 Accepted`.

---

### Scan Status

`GET /api/scan-status`

```json
{
  "status": "scanning",
  "stage": "importing",
  "current": "Artist - Title.psarc",
  "done": 42,
  "total": 150
}
```

---

### Cleanup Orphans

`POST /api/library/cleanup-orphans` — Auth required

Removes `Song` records with no corresponding `Track`. Returns `204`.

---

## Tracks

### Track Metadata

`GET /api/tracks/:trackId`

Returns full `Track` record.

---

### Track Data

`GET /api/tracks/:trackId/data`

Returns `TrackData` (arrangement list, storage IDs).

---

### Cover Image

`GET /api/tracks/:trackId/cover`

Returns PNG image. `404` if no cover is stored.

---

### Audio Stream

`GET /api/tracks/:trackId/audio`

Returns OGG audio with full HTTP range support (206 Partial Content). Suitable for `<audio>` element seeking.

---

### Stem Audio

`GET /api/tracks/:trackId/stems/:stemIndex/audio`

Returns OGG for the specified stem index (0-based).

---

### Stems List

`GET /api/tracks/:trackId/stems`

```json
{ "stems": [ StemData ] }
```

---

### Update Track

`POST /api/tracks/:trackId` — Requires `EDIT_TRACKS`

Multipart or JSON body. Editable fields: `title`, `artist`, `album`, `year`, `coverImage` (file).

---

### Delete Track

`DELETE /api/tracks/:trackId` — Requires `DELETE_TRACKS`

Cascades to TrackData, Stems, StemData, Favorites, Loops, Scores, and MinIO objects.

---

### Highway (Chart Data)

`GET /api/tracks/:trackId/highway?arrangement=N`

Returns the full `HighwayResponse` for arrangement index `N`. See [Player & Highway](player.md) for the complete shape.

---

### Cover Grid

`GET /api/covers?count=30`

Returns an array of `trackId` strings for tracks that have cover images. Used for the library grid background.

---

## Scores

### Submit Score

`POST /api/tracks/:trackId/score`

```json
{ "profileId": 2, "score": 87 }
```

Stores best score (never decrements), increments play count.

---

### Batch Scores

`POST /api/scores/batch`

```json
{ "profileId": 2, "trackIds": ["abc", "def"] }
```

```json
{
  "abc": { "bestScore": 95, "playCount": 4, "lastPlayedAt": "..." },
  "def": { "bestScore": 72, "playCount": 1, "lastPlayedAt": "..." }
}
```

---

## Loops

### List Loops

`GET /api/tracks/:trackId/loops?profileId=N`

```json
[ { "id": 1, "name": "Chorus", "startTime": 45.0, "endTime": 78.3 } ]
```

---

### Create Loop

`POST /api/tracks/:trackId/loops` — Auth required

```json
{ "name": "Verse 2", "start_time": 90.0, "end_time": 120.5 }
```

---

### Delete Loop

`DELETE /api/loops/:id` — Auth required

Returns `204`.

---

## Favourites

### Toggle Favourite

`POST /api/favorites/toggle` — Auth required

```json
{ "trackId": "abc123", "profileId": 2 }
```

```json
{ "favorite": true }
```

---

## Settings

### Get Settings

`GET /api/settings`

```json
{
  "dlcDir": "/data/dlc",
  "psarcPlatform": "pc",
  "defaultArrangement": "Lead",
  "avOffsetMs": -50,
  "demucsServerUrl": "http://demucs:8080"
}
```

All fields are optional; missing keys use built-in defaults.

---

### Update Settings

`POST /api/settings` — Requires `MANAGE_SETTINGS`

Partial update — send only the fields to change.

---

### Export Settings

`GET /api/settings/export` — Auth required

Downloads a ZIP archive containing `config.json` and any plugin configs.

---

### Import Settings

`POST /api/settings/import` — Requires `MANAGE_SETTINGS`

Multipart form upload of a settings ZIP bundle.

---

## Diagnostics

### Export Diagnostics Bundle

`POST /api/diagnostics/export` — Auth required

Returns a `diagnostics.zip` containing:
- Server logs
- Hardware info
- Plugin inventory
- WebGL capabilities
- Browser console transcript (submitted by frontend)

---

## Plugins

### List Plugins

`GET /api/plugins`

```json
[ { "id": "themes", "name": "Themes", "state": "active", "bundled": true } ]
```

---

### Get Plugin

`GET /api/plugins/:id`

---

### Enable / Disable Plugin

`POST /api/plugins/:id/enable` — Auth required

`POST /api/plugins/:id/disable` — Auth required

Takes effect on next server restart.

---

### Purge Plugin Data

`POST /api/plugins/:id/purge` — Requires `ADMIN`

Deletes all `PluginData` rows for this plugin.

---

### Serve Plugin Asset

`GET /api/plugins/:id/file/*path`

No auth. Used by the frontend to load plugin scripts and Vue components.

---

### Plugin Settings Page

`GET /api/plugins/:id/settings`

Returns raw HTML defined in the plugin manifest's `settings` field.

---

### List Providers

`GET /api/plugins/providers`

```json
{
  "storage":  [ { "name": "local", "pluginId": "built-in", "active": true } ],
  "metadata": [ { "name": "musicbrainz", "pluginId": "mb", "active": true } ]
}
```

---

### Switch Active Provider

`PUT /api/plugins/providers/:type/active` — Requires `MANAGE_SETTINGS`

```json
{ "name": "s3" }
```

---

### Available Permissions

`GET /api/plugins/permissions/available`

Returns combined list of built-in and plugin-defined permissions.

---

## Version & Setup

### App Version

`GET /api/version`

```json
{ "version": "1.4.0", "gitSha": "abc1234", "buildDate": "2026-05-01" }
```

---

### Setup Status

`GET /api/setup/status`

```json
{ "configured": false, "profiles": 0 }
```

---

### Initialise

`POST /api/setup/init`

Only available when `configured: false`. Creates the first admin profile.

```json
{ "name": "Admin", "pin": "1234", "recoveryPhrase": "my phrase" }
```

---

## Permission Groups (Admin)

### List Groups

`GET /api/admin/permission-groups` — Requires `MANAGE_PERMISSIONS`

---

### Create Group

`POST /api/admin/permission-groups` — Requires `MANAGE_PERMISSIONS`

```json
{ "name": "Editors", "profileIds": [2, 3], "permissions": ["EDIT_TRACKS"] }
```

---

### Update Group

`PATCH /api/admin/permission-groups/:id` — Requires `MANAGE_PERMISSIONS`

---

### Delete Group

`DELETE /api/admin/permission-groups/:id` — Requires `MANAGE_PERMISSIONS`

---

## See Also

- [Authentication & Profiles](authentication.md)
- [Library System](library.md)
- [Player & Highway](player.md)
- [Plugin API Reference](plugin-api-reference.md)
