# Library System

The library is the collection of all songs known to SlopSmith. It is populated by scanning a configured DLC directory, and supports rich filtering, searching, and per-profile favourites.

---

## Song vs Track

Two related concepts exist in the data model:

| Concept | Table | Purpose |
|---|---|---|
| **Song** | `Song` | Lightweight metadata cache indexed for full-text search. Keyed by filename. |
| **Track** | `Track` + `TrackData` | Playable wrapper with storage IDs for cover art, audio, and stems. |

A `Song` is created/updated every time the scanner processes a file. A `Track` is created by `ImportService` after media extraction completes. Both exist in parallel — search queries hit `Song`, playback hits `Track`.

---

## Scanning

### Trigger

Scans can be triggered in three ways:

- **Manual**: `POST /api/rescan` (incremental — skips unchanged files) or `POST /api/rescan/full` (re-processes everything)
- **Startup**: Optionally runs a scan when the server starts (configured via settings)
- **Periodic**: Configurable interval-based background scan

### What the scanner does

1. `ScannerService` lists files matching glob patterns in the configured `dlcDir`.
2. Files are compared against cached `mtime` + `size` — unchanged files are skipped.
3. New or changed files are queued in `ImportService` (max 4 concurrent).
4. For each file, `ImportService`:
   - Detects format (PSARC / Sloppak / Loose / SNG)
   - Extracts metadata → upserts `Song` record
   - Extracts cover art → stores PNG in MinIO as `cover_{trackId}`
   - Extracts audio → FFmpeg → OGG → stores in MinIO as `audio_{trackId}`
   - Creates `Track` + `TrackData` records in PostgreSQL

### Scan status

Poll `GET /api/scan-status` during an active scan:

```json
{
  "status": "scanning",
  "stage": "importing",
  "current": "Artist - Song Title.psarc",
  "done": 42,
  "total": 150
}
```

`status` values: `idle` | `listing` | `scanning` | `complete` | `error`

### SNG conversion

PSARC files that contain only compiled `.sng` charts (ODLC) are converted to temporary XML via **RsCli** on first import. This is slow but only happens once — the result is cached.

---

## Metadata Extraction

| Format | Source of metadata |
|---|---|
| PSARC | `manifest.json` inside the archive (Rocksmith attributes) + arrangement XMLs |
| Sloppak | `manifest.yaml` + arrangement JSON files |
| Loose | `manifest.yaml` if present, otherwise XML files in the directory |
| SNG | Converted to XML first, then parsed as above |

**Tuning** is stored in two forms:
- `tuning`: Human-readable name (e.g., `"D Standard"`)
- `tuningSortKey`: Numeric sort key enabling natural ordering (D Standard < Eb Standard < E Standard)

---

## Searching

`GET /api/library`

All parameters are optional and can be combined.

### Query parameters

| Parameter | Type | Description |
|---|---|---|
| `q` | string | Full-text search across artist, title, album |
| `page` | int | Page number (0-indexed, default 0) |
| `size` | int | Results per page (max 200, default 50) |
| `sort` | string | See sort options below |
| `format` | string | `psarc` \| `sloppak` \| `loose` |
| `arrangements_has` | string[] | Must have these arrangement types (Lead, Rhythm, Bass, Combo) |
| `arrangements_lacks` | string[] | Must not have these arrangement types |
| `stems_has` | string[] | Must have these stem types (guitar, bass, drums, vocals) |
| `stems_lacks` | string[] | Must not have these stem types |
| `has_lyrics` | bool | Only songs with lyric data |
| `tunings` | string[] | Filter by tuning names (e.g., `["D Standard","Drop D"]`) |
| `favorites` | bool | Only favourited songs for the current profile |

### Sort options

| Value | Order |
|---|---|
| `artist` | Artist A → Z |
| `artist-desc` | Artist Z → A |
| `title` | Title A → Z |
| `title-desc` | Title Z → A |
| `recent` | Recently added (newest first) |
| `tuning` | Tuning natural order (lowest first) |
| `year` | Year ascending |
| `year-desc` | Year descending |

### Response

```json
{
  "songs": [ SongMeta, ... ],
  "total": 452,
  "page": 0,
  "size": 50
}
```

### SongMeta shape

```ts
{
  trackId: string
  filename: string
  artist: string
  title: string
  album: string
  year?: number
  duration: number        // seconds
  tuningName: string
  arrangements: Array<{ index: number; name: string; notes: number }>
  stemCount: number
  stemIds: string[]
  hasLyrics: boolean
  hasEstd: boolean        // has an E Standard retune arrangement
  favorite: boolean       // relative to current profile
  format: "psarc" | "sloppak" | "loose"
}
```

---

## Artists View

`GET /api/library/artists`

Returns a hierarchical tree grouped by first letter, then artist name, then songs. Useful for the A–Z browser view.

```json
{
  "letters": [
    {
      "letter": "A",
      "artists": [
        {
          "name": "AC/DC",
          "songs": [ SongMeta, ... ]
        }
      ]
    }
  ]
}
```

---

## Library Stats

`GET /api/library/stats`

```json
{
  "totalSongs": 452,
  "totalArtists": 87,
  "letters": {
    "A": 34,
    "B": 21,
    ...
  }
}
```

---

## Tuning Names

`GET /api/library/tuning-names`

Returns all distinct tuning names present in the library, ordered by frequency:

```json
[
  { "name": "E Standard", "count": 312 },
  { "name": "D Standard", "count": 78 },
  { "name": "Drop D",     "count": 41 }
]
```

---

## Favourites

Favourites are per-profile. Any profile can favourite any song independently.

`POST /api/favorites/toggle`

```json
{ "trackId": "abc123", "profileId": 2 }
```

Returns the new favourite state:

```json
{ "favorite": true }
```

Favourite songs appear in the library with `"favorite": true` in their `SongMeta`. Filter to only favourites with `?favorites=true` in library queries.

---

## Track Metadata Editing

`POST /api/tracks/:trackId` (requires `EDIT_TRACKS` permission)

Editable fields: `title`, `artist`, `album`, `year`, `coverImage` (multipart file upload).

Changes are written to the `Track` record and the `Song` metadata cache is updated so search results reflect the edit immediately.

---

## Track Deletion

`DELETE /api/tracks/:trackId` (requires `DELETE_TRACKS` permission)

Cascades to:
- `TrackData` record
- `Stems` + all `StemData` records
- MinIO objects (cover, audio, stems)
- `Favorite` entries
- `TrackLoop` entries
- `TrackScore` entries
- The `Song` metadata cache entry

---

## Orphan Cleanup

`POST /api/library/cleanup-orphans`

Deletes `Song` records that no longer have a corresponding `Track`. Useful after manually removing files from the DLC directory without a full rescan.

---

## See Also

- [Architecture Overview](architecture.md)
- [SlopPak Format](sloppak-format.md)
- [Player & Highway](player.md)
- [API Reference](api-reference.md)
