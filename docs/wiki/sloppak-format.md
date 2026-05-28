# SlopPak Format

SlopPak is SlopSmith's open, unencrypted song format. It is the preferred format for new content — easier to create, inspect, and extend than PSARC.

---

## Structure

A SlopPak is either a **directory** or a **ZIP archive** (`.sloppak`). Both layouts are identical:

```
my-song.sloppak/
├── manifest.yaml              # required — index and metadata
├── arrangements/
│   ├── lead.json              # note chart (wire format)
│   ├── rhythm.json
│   └── bass.json
├── stems/
│   ├── full.ogg               # full mix (pre-split)
│   ├── guitar.ogg             # per-instrument stems (post-split)
│   ├── bass.ogg
│   ├── drums.ogg
│   └── vocals.ogg
├── lyrics.json                # optional — syllable timing
└── cover.jpg                  # optional — album art (any image format)
```

Only `manifest.yaml` is required. Add only the sections your song uses.

---

## manifest.yaml

```yaml
version: 1                     # format version, always 1 for now
title: "Song Title"
artist: "Artist Name"
album: "Album Name"
year: 2024
duration: 240.5                # seconds (float)

arrangements:
  - id: lead
    name: Lead
    file: arrangements/lead.json
    tuning: [0, 0, 0, 0, 0, 0]  # semitone offsets: E A D G B e
    capo: 0
  - id: rhythm
    name: Rhythm
    file: arrangements/rhythm.json
    tuning: [0, 0, 0, 0, 0, 0]
    capo: 0

stems:
  - id: full
    file: stems/full.ogg
    default: true
  - id: guitar
    file: stems/guitar.ogg
  - id: bass
    file: stems/bass.ogg

lyrics: lyrics.json            # omit if no lyrics
cover: cover.jpg               # omit if no cover art
```

### Tuning field

The `tuning` array contains semitone offsets from standard EADGBE, one per string from lowest to highest. Examples:

| Tuning | Array |
|---|---|
| E Standard | `[0, 0, 0, 0, 0, 0]` |
| D Standard | `[-2, -2, -2, -2, -2, -2]` |
| Drop D | `[-2, 0, 0, 0, 0, 0]` |
| Open G | `[-2, -2, 0, 0, -1, -2]` |

---

## Arrangement JSON (wire format)

Each arrangement file contains the full chart for one playing part. Fields are short-named to minimise file size.

```json
{
  "name": "Lead",
  "tuning": [0, 0, 0, 0, 0, 0],
  "capo": 0,

  "notes": [ ... ],
  "chords": [ ... ],
  "chord_templates": [ ... ],
  "anchors": [ ... ],
  "handshapes": [ ... ],
  "beats": [ ... ],
  "sections": [ ... ],
  "phrases": [ ... ],
  "tone_changes": [ ... ]
}
```

### notes

Each note omits boolean technique fields when false.

```json
{ "t": 12.345, "s": 2, "f": 7 }
{ "t": 13.0,   "s": 0, "f": 5, "sus": 0.5, "ho": true }
{ "t": 14.0,   "s": 3, "f": 9, "sl": 11, "bn": 1 }
```

| Field | Description |
|---|---|
| `t` | Start time (seconds) |
| `s` | String index (0 = low E, 5 = high e) |
| `f` | Fret number |
| `sus` | Sustain duration in seconds (omit if 0) |
| `sl` | Pitched slide-to fret |
| `sl2` | Unpitched slide-to fret |
| `bn` | Bend amount in semitones |
| `ho` | Hammer-on (`true` only) |
| `po` | Pull-off (`true` only) |
| `harm` | Natural harmonic (`true` only) |
| `pharm` | Pinch harmonic (`true` only) |
| `vib` | Vibrato (`true` only) |
| `tap` | Tap (`true` only) |
| `mute` | Palm mute (`true` only) |

### chords

```json
{
  "t": 30.0,
  "id": 12,
  "hd": true,
  "notes": [
    { "s": 0, "f": 3 },
    { "s": 1, "f": 2 },
    { "s": 2, "f": 0 }
  ]
}
```

`id` is a zero-based index into `chord_templates`. `hd` (high-density / arpeggio) is omitted when false.

### chord_templates

```json
{
  "name": "Em7",
  "displayName": "Em7",
  "frets":   [0, 2, 2, 0, 3, 0],
  "fingers": [0, 1, 2, 0, 3, 0],
  "arpeggio": false
}
```

`frets`: -1 = muted string. `fingers`: 0 = open, 1–4 = finger number.

### anchors

Fretting-hand position windows — drive the highway zoom box.

```json
{ "time": 12.0, "fret": 5, "width": 4 }
```

### handshapes

Visual chord hold spans.

```json
{ "chord_id": 12, "start_time": 30.0, "end_time": 31.5 }
```

### beats

```json
{ "time": 0.0,  "measure": 1 }
{ "time": 0.5,  "measure": -1 }
{ "time": 1.0,  "measure": 2 }
```

`measure: -1` indicates a sub-beat (e.g., beat 2 of 4 in a 4/4 bar).

### sections

```json
{ "name": "verse",  "number": 1, "time": 12.5 }
{ "name": "chorus", "number": 1, "time": 45.0 }
{ "name": "verse",  "number": 2, "time": 78.2 }
```

### phrases (optional)

Enables the multi-difficulty mastery slider. Omit if the song has a single difficulty.

```json
{
  "name": "phrase1",
  "maxDifficulty": 3,
  "disparity": false,
  "solo": false,
  "ignore": false,
  "startTime": 12.5,
  "endTime": 45.0
}
```

### tone_changes (optional)

```json
{ "time": 0.0,  "name": "Clean Rhythm" }
{ "time": 45.0, "name": "Lead Drive" }
```

---

## lyrics.json

Syllable-level lyric timing. Each entry is one syllable or word fragment.

```json
[
  { "t": 12.34, "d": 0.18, "w": "Hel" },
  { "t": 12.52, "d": 0.22, "w": "lo-" },
  { "t": 12.74, "d": 0.26, "w": "world" },
  { "t": 13.20, "d": 0.30, "w": "+" }
]
```

| Field | Description |
|---|---|
| `t` | Start time (seconds) |
| `d` | Duration (seconds) |
| `w` | Word or fragment. `-` suffix = syllable continues on the same line. `+` = line break. |

The player joins syllables within a line for karaoke-style display, highlighting each as its time arrives.

---

## Stems

Stems are per-instrument audio tracks. SlopSmith can play the full mix or individual stems for mute/solo practice.

| Stem ID | Description |
|---|---|
| `full` | Complete mix (always present) |
| `guitar` | Guitar only |
| `bass` | Bass only |
| `drums` | Drums only |
| `vocals` | Vocals only |
| `other` | Any remaining instruments |

Stems are produced by running the full mix through **Demucs** (configured via `demucsServerUrl` in settings). Before stem splitting, only `full.ogg` is available.

---

## Extensibility

SlopPak is designed to be extended without breaking existing parsers:

- **Unknown manifest keys** are silently ignored by the importer.
- **New files** not referenced in the manifest are ignored.
- **New arrangement fields** are ignored by older renderers.
- The `version` field in the manifest allows future breaking changes to be handled gracefully.

To add a custom data file (e.g., drum tab), add a key to the manifest pointing to your file, then read it in a plugin via the file-serving route (`GET /api/plugins/:id/file/*`).

---

## Converting from Other Formats

SlopSmith can import PSARC and Loose (XML) files natively. To convert them to SlopPak for easier editing, use the planned export tool (see `docs/PLUGIN_SYSTEM_PROPOSAL.md` for the converter plugin spec).

SNG files (compiled ODLC) are automatically converted to XML at import time via RsCli, then processed as Loose format.

---

## See Also

- [Library System](library.md)
- [Player & Highway](player.md)
- [Architecture Overview](architecture.md)
