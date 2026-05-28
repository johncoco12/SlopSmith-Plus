# Database Schema

SlopSmith uses PostgreSQL 16 managed via **Prisma ORM**. This page documents every model, its fields, and its relations.

---

## Song

Lightweight metadata cache for the library search index. One row per file on disk. Keyed by filename so it can be invalidated when a file changes.

| Field | Type | Description |
|---|---|---|
| `filename` | String (PK) | Relative path from the DLC directory |
| `mtime` | BigInt | File modification time (ms since epoch) — used for cache invalidation |
| `size` | BigInt | File size in bytes — used for cache invalidation |
| `title` | String | Song title |
| `artist` | String | Artist name |
| `album` | String? | Album name |
| `year` | Int? | Release year |
| `duration` | Float | Duration in seconds |
| `tuning` | String | Raw tuning string (e.g., `"E Standard"`) |
| `tuningName` | String | Human-readable tuning label |
| `tuningSortKey` | Float | Numeric key for natural tuning ordering |
| `arrangements` | Json | Array of `{ index, name, notes }` |
| `hasLyrics` | Boolean | Whether lyric data is present |
| `hasEstd` | Boolean | Whether an E Standard retune arrangement is present |
| `format` | String | `psarc` \| `sloppak` \| `loose` |
| `stemCount` | Int | Number of stems available |
| `stemIds` | Json | Array of stem ID strings |

---

## Track

The playable entity. Created by `ImportService` after media extraction; has storage references for cover art, audio, and stems.

| Field | Type | Description |
|---|---|---|
| `id` | Int (PK) | Auto-increment primary key |
| `trackId` | String (unique) | Stable public ID used in API URLs |
| `title` | String | |
| `artist` | String | |
| `album` | String? | |
| `year` | Int? | |
| `duration` | Float | Seconds |
| `tuning` | String | |
| `tuningName` | String | |
| `tuningSortKey` | Float | |
| `hasLyrics` | Boolean | |
| `format` | String | |
| `createdAt` | DateTime | |
| `modifiedAt` | DateTime | |

**Relations**: `trackData TrackData?`, `stems Stems?`

---

## TrackData

Links a `Track` to its storage objects and parsed arrangement list.

| Field | Type | Description |
|---|---|---|
| `id` | Int (PK) | |
| `trackId` | Int (FK → Track, unique) | |
| `originalFilename` | String (unique) | Source file path |
| `arrangements` | Json | Array of `{ index, name, notes }` |
| `coverImageStorageId` | String? | MinIO key for cover PNG |
| `audioFileStorageId` | String? | MinIO key for OGG audio |

---

## Stems

Container for all stems of one track.

| Field | Type | Description |
|---|---|---|
| `id` | Int (PK) | |
| `trackId` | Int (FK → Track, unique, cascade delete) | |

**Relations**: `items StemData[]`

---

## StemData

One stem track (one instrument audio file).

| Field | Type | Description |
|---|---|---|
| `id` | Int (PK) | |
| `stemsId` | Int (FK → Stems, cascade delete) | |
| `stemIndex` | Int | 0-based index |
| `arrangement` | String? | Label (e.g., `"rhythm"`, `"guitar"`) |
| `stemAudioFileStorageId` | String | MinIO key for OGG stem file |

---

## Profile

User identity. Sensitive fields are never exposed in API responses.

| Field | Type | Description |
|---|---|---|
| `id` | Int (PK) | |
| `name` | String (unique) | Display name |
| `avatarId` | Int? | Avatar index |
| `pinCode` | String? | SHA-256(salt + PIN) |
| `pinSalt` | String? | Random salt for PIN |
| `recoveryPhrase` | String? | SHA-256(salt + phrase) |
| `recoveryPhraseSalt` | String? | Random salt for recovery phrase |
| `recoveryPhraseHint` | String? | User-visible hint |
| `locked` | Boolean | Admin lock flag |
| `profileSettings` | Json? | Per-profile preferences |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

---

## Session

Active authentication tokens.

| Field | Type | Description |
|---|---|---|
| `id` | Int (PK) | |
| `token` | String (unique) | UUID Bearer token |
| `profileId` | Int (FK → Profile) | |
| `createdAt` | DateTime | |
| `expiresAt` | DateTime | 24 hours after creation |

Expired sessions are cleaned up lazily on validation and by a periodic background job.

---

## Favorite

Per-profile song favourites. Composite primary key.

| Field | Type | Description |
|---|---|---|
| `trackId` | String (PK, composite) | |
| `profileId` | Int (PK, composite) | |
| `createdAt` | DateTime | |
| `modifiedAt` | DateTime | |

---

## TrackLoop

Named A-B practice loops saved per profile + track.

| Field | Type | Description |
|---|---|---|
| `id` | Int (PK) | |
| `profileId` | Int | |
| `trackId` | String | |
| `name` | String | Default: `"Loop 1"`, `"Loop 2"`, … |
| `startTime` | Float | Seconds |
| `endTime` | Float | Seconds |
| `createdAt` | DateTime | |

---

## TrackScore

Best score and play statistics per profile + track. Composite unique on `(profileId, trackId)`.

| Field | Type | Description |
|---|---|---|
| `id` | Int (PK) | |
| `profileId` | Int | |
| `trackId` | String | |
| `bestScore` | Int | 0–100 (never decrements) |
| `playCount` | Int | Incremented each session |
| `lastPlayedAt` | DateTime | |

---

## PermissionGroup

Groups of profiles sharing a set of permissions.

| Field | Type | Description |
|---|---|---|
| `id` | Int (PK) | |
| `name` | String (unique) | Group name (e.g., `"Editors"`) |
| `profileIds` | Int[] | Member profile IDs |
| `permissions` | String[] | Permission names from the `Permissions` enum |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

---

## PluginData

Scoped key-value store for plugins. Composite unique on `(pluginId, key)`.

| Field | Type | Description |
|---|---|---|
| `id` | String (PK, cuid) | |
| `pluginId` | String | Plugin identifier |
| `key` | String | Arbitrary key (namespaced by pluginId) |
| `value` | Json | Any JSON-serialisable value |
| `updatedAt` | DateTime | |

---

## Entity Relationship Summary

```
Profile ──< Session          (1 profile : many sessions)
Profile ──< Favorite         (per-profile favourites)
Profile ──< TrackLoop        (per-profile loops)
Profile ──< TrackScore       (per-profile scores)

Track ──── TrackData         (1:1, cascade delete)
Track ──── Stems             (1:1, cascade delete)
Stems ──< StemData           (1 stems container : many stem files)

Song                         (independent cache, keyed by filename)
PermissionGroup              (references profile IDs by value, not FK)
PluginData                   (scoped KV store, no FK to Plugin model)
```

---

## See Also

- [Architecture Overview](architecture.md)
- [Library System](library.md)
- [Authentication & Profiles](authentication.md)
