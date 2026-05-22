# Parsing Deep Analysis

> Comparative analysis of how the legacy Python backend (`legacy/`) and the new TypeScript backend (`backend/`) parse Rocksmith CDLC data. Identifies wire-format incompatibilities, logic gaps, and behavioral differences that could cause data loss or incorrect playback.

---

## 1. XML Parsing

Both backends parse Rocksmith arrangement XML files. The format uses a `<song>` root element with `<notes>`, `<chords>`, `<ebeats>`, `<sections>`, `<levels>`, `<chordTemplates>`, etc.

### 1.1 Element-style vs Attribute-style

Rocksmith XMLs store metadata in **both** forms. This is the root cause of the `song_info` title/artist/duration bug we fixed.

**Child element form** (most common in CDLC):
```xml
<song version="7">
  <title>Aerodynamic</title>
  <artistName>Daft Punk</artistName>
  <songLength>217.615</songLength>
</song>
```

**Attribute form** (rare, seen in some official DLC):
```xml
<song version="7" title="Aerodynamic" artistName="Daft Punk" songLength="217.615">
```

**Fix applied**: `num()` and `str()` helpers now check both `el['@_key']` (attribute) and `el[key]` (element) via `??` fallback.

### 1.2 Boolean Parsing

| Aspect | Python (`_bool`) | TypeScript (`bool()`) | Impact |
|--------|------------------|-----------------------|--------|
| Truthy values | `not in {"","0","false","False","FALSE"}` | `1, "1", true, "true"` | TS stricter |
| `attribute="0"` | `False` | `False` | Match |
| `attribute="1"` | `True` | `True` | Match |
| `attribute="yes"` | `True` | `False` | **TS misses this** |
| `attribute="true"` | `True` | `True` | Match |
| Missing attribute | `False` | `false` | Match |

Python's `xml.etree.ElementTree` always returns string attribute values. TS's `fast-xml-parser` with `parseAttributeValue: true` auto-converts numeric-looking strings to numbers. TS catches both `1` (number) and `"1"` (string). But TS misses `"yes"` which is valid in some edge-case XMLs.

### 1.3 Integer Parsing

Python's `_int()` has a two-step fallback: `int(v)` → `int(float(v))`. This means `"4.5"` becomes `4` (truncation, not rounding). TS's `num()` directly uses `Number(v)`. For `"4.5"`, `Number("4.5")` = `4.5`, which doesn't match the expected int behavior. However `num()` is only used for integer fields (fret, string, difficulty) where decimal values are unexpected.

### 1.4 Extended String Range

**Python** dynamically detects extended-range instruments (7-string, 8-string, 5-string bass):
```python
tuning = [_int(el, f"string{i}") for i in range(6)]
i = 6
while el.get(f"string{i}") is not None:
    tuning.append(_int(el, f"string{i}"))
    i += 1
```

**TypeScript hardcodes 6 strings** in `parseArrangementXml()`:
```typescript
const tuning = Array.from({ length: 6 }, (_, i) => num(tuningEl, `string${i}`));
```

**Impact**: 7-string and 8-string guitar charts, and 5-string bass charts that explicitly declare a 5th string in the XML, will have their tuning truncated to 6 strings. Note data at string indices ≥ 6 would be out of range.

### 1.5 Extended Chord Template Fingers/Frets

**Python** dynamically detects chord template width:
```python
width = 6
while ct.get(f"fret{width}") is not None or ct.get(f"finger{width}") is not None:
    width += 1
```

**TypeScript hardcodes 6**:
```typescript
fingers: Array.from({ length: 6 }, (_, i) => num(ct, `finger${i}`, -1)),
frets: Array.from({ length: 6 }, (_, i) => num(ct, `fret${i}`, -1)),
```

**Impact**: Chord templates with extended-range fingering (unlikely in practice, but theoretically possible for 7/8-string charts) lose finger/fret data beyond string 5.

### 1.6 Chord Template Arpeggio Detection

**Python** checks multiple attribute casings AND the displayName:
```python
def _chord_template_arpeggio_flag(el):
    for key in ("arpeggio", "Arpeggio", "arp", "Arp"):
        if _bool(el, key): return True
    name = (el.get("displayName") or "").lower()
    return "-arp" in name or "arpeggio" in name
```

**TypeScript** only checks one casing:
```typescript
arpeggio: bool(ct, "arpeggio"),
```

**Impact**: Authoring tools that use `Arpeggio` or `arp` attribute casing lose arpeggio detection. The displayName heuristic (`"-arp"` or `"arpeggio"` in name) is entirely missing — chord templates with names like "Muted-arp" won't be marked as arpeggios.

### 1.7 Chord High-Density Detection

**Python** checks multiple casings:
```python
for key in ("highDensity", "highdensity", "HighDensity"):
    if _bool(el, key): return True
```

**TypeScript** checks one:
```typescript
highDensity: bool(el, "highDensity"),
```

**Impact**: Authoring tools using non-standard casing (`highdensity`) lose the high-density flag on chords. Minor — most tools use the standard `highDensity`.

### 1.8 HandShape Arpeggio Detection

**Python** checks 4 attribute names:
```python
for key in ("arpeggio", "Arpeggio", "arp", "Arp"):
    if _bool(el, key): return True
```

**TypeScript** checks one:
```typescript
arpeggio: bool(el, "arpeggio"),
```

**Impact**: Handshapes authored with `Arpeggio` or `arp` attributes lose arpeggio marking.

### 1.9 Chord Template Note Synthesis

**Python** synthesizes chord notes from chord template frets when a chord has no `<chordNote>` children:
```python
if not chord_notes and cid < len(chord_templates):
    ct = chord_templates[cid]
    for s in range(len(ct.frets)):
        if ct.frets[s] >= 0:
            chord_notes.append(Note(time=t, string=s, fret=ct.frets[s]))
```

**TypeScript does NOT** do this in `parseLevel()`.

**Impact**: Chords without explicit `<chordNote>` children but with a valid `chordId` referencing a chord template will appear with zero notes in the TypeScript backend. These are "template-only" chords — rare in practice (most charts explicitly write chord notes), but some automated tools may emit them.

### 1.10 Arrangement Name Resolution

**Python** has a comprehensive name mapping table:
```python
_name_map = {
    "part real_guitar": "Lead",
    "part real_guitar_22": "Rhythm",
    "part real_bass": "Bass",
    "part real_guitar_bonus": "Bonus Lead",
    "part real_bass_22": "Bass 2",
}
```
Also cross-references manifest JSONs (`Entries` → `ArrangementName`) and infers from filenames.

**TypeScript** only reads `str(root, "arrangement", "Lead")` — the raw `arrangement` attribute from the XML root — with a simplistic filename-based fallback:
```typescript
const KNOWN_ARRANGEMENTS = ["lead", "bass", "rhythm", "combo"];
```
It extracts the last underscore-delimited segment of the filename stem, capitalizing the first letter.

**Impact**: The TS backend may produce arrangement names that differ from both the manifest and the Python backend. For example, `cstdpaerodynamic_bass.xml` → `str(root, "arrangement")` might return `"PART REAL_BASS"` which doesn't match any known arrangement key. Under Python this maps to `"Bass"` via `_name_map`. Under TS it falls through to the raw attribute value `"PART REAL_BASS"`.

### 1.11 Arrangement Sorting

**Python** sorts arrangements by priority: Lead(0) > Combo(1) > Rhythm(2) > Bass(3) > other(99).

**TypeScript** does not sort — arrangements appear in filesystem order.

**Impact**: The arrangement list order in the WebSocket `song_info.arrangements` differs between backends. This affects which arrangement is auto-selected (first in list == default).

---

## 2. PSARC Parsing

### 2.1 Header Layout (32 bytes)

| Offset | Size | Field | Notes |
|--------|------|-------|-------|
| 0 | 4 | Magic `"PSAR"` | Both validate |
| 4 | 4 | Version + Compression (2+2) | Discarded by both |
| 8 | 4 | Compression name string e.g. `"zlib"` | Discarded |
| **12** | **4** | **TOC length** | **Big-endian uint32** |
| 16 | 4 | TOC entry size | Typically 30 |
| 20 | 4 | TOC entry count | Both cap at 100000 |
| 24 | 4 | Block size | Typically 65536 |
| 28 | 4 | Archive flags | 4 = encrypted |

**Historical bug (now fixed)**: The original TS implementation read the compression name string at offset 8 as the TOC length. The Python implementation correctly reads offset 12.

### 2.2 AES-CFB Decryption

Both use identical key/IV:
```
Key: C53DB23870A1A2F71CAE64061FDD0E1157309DC85204D4C5BFDF25090DF2572C
IV:  E915AA018FEF71FC508132E4BB4CEB42
```

Both use AES-256-CFB with segment_size=128 (full-block CFB). Compatible.

**Python fallback**: Imports `aes_fallback` module for platforms without Crypto.Cipher.AES (iOS). TS has no fallback — relies on Node.js `crypto.createDecipheriv`.

### 2.3 TOC Entry (30 bytes)

| Offset | Size | Field |
|--------|------|-------|
| 0-15 | 16 | MD5 hash (stored but never verified) |
| 16-19 | 4 | Z-index (big-endian uint32) |
| 20-24 | 5 | Entry length (big-endian, 5 bytes) |
| 25-29 | 5 | Entry offset (big-endian, 5 bytes) |

Both backends handle 5-byte integers identically (Python's `int.from_bytes(..., "big")` and TS's BigInt arithmetic).

### 2.4 Block Extraction

**Python** tries `zlib.decompress()`; on `zlib.error`, returns raw bytes as fallback (handles uncompressed blocks with non-zero compressed-size headers).

**TypeScript** uses `inflateSync()` from `node:zlib`; on error, returns raw bytes fallback.

Same behavior.

### 2.5 Quick Metadata Scan

**Python** (`_extract_meta_fast`) reads JSON manifests AND checks for lyrics:
- Reads `["*.json", "*.xml", "*vocals*.sng"]` from the PSARC
- Checks if any `.xml` has root `<vocals>` tag
- Checks if any `.sng` filename contains "vocals"
- Falls back to full PSARC extraction when fast scan returns no title

**TypeScript** (`extractQuickMeta`) only reads JSON:
- Reads `["**/*.json"]` — glob pattern broader than Python's `["*.json"]`
- **Always returns `hasLyrics: false`** — never checks XML or SNG for vocals
- **No fallback** — if the manifest JSONs lack metadata (no SongName/ArtistName), returns a mostly-empty result

### 2.6 Full Extraction

**Python** (`load_song`) has SNG→XML conversion:
```python
def _convert_sng_to_xml(extracted_dir):
    # Locates RsCli binary, runs `rscli sng2xml` for each .sng file
    # (except vocals, which are handled by sng_vocals.py)
```

**TypeScript** (`loadSongFromDirectory`) has NO SNG conversion. It only parses `.xml` files. If the PSARC contains only `.sng` binaries (common for official DLC and many CDLC sources), `loadSongFromDirectory` returns an empty `Song` with `{ arrangements: [], title: "", artist: "", ... }`.

**Impact**: Songs that ship only `.sng` files (no `.xml`) cannot be played through the TypeScript backend at all. The library metadata may still work (from JSON manifests), but the highway WebSocket receives empty arrangements and returns "No arrangements found".

---

## 3. JSON Manifest Parsing

Both backends parse the same PSARC manifest JSON structure:

```json
{
  "Entries": {
    "some_key": {
      "Attributes": {
        "SongName": "Aerodynamic",
        "ArtistName": "Daft Punk",
        "ArrangementName": "Lead",
        "Tuning": {"string0": 0, "string1": 0, ...},
        "NotesHard": 222
      }
    }
  }
}
```

### 3.1 Tuning Object

Python reads `Tuning` as a dict and extracts `string0`..`string5` by iterating keys. TS does the same but accesses them individually.

Both convert to comma-separated offsets string for DB storage.

### 3.2 Note Count Extraction

**Python**: `attr.get("NotesHard", 0) or attr.get("NotesMedium", 0) or 0`

**TypeScript**: `Number(attrs["NotesHard"] ?? attrs["NotesMedium"] ?? attrs["NotesEasy"] ?? 0)`

Both look for NotesHard first, fall back to easier difficulties. TS also checks NotesEasy as a third fallback. Note counts from manifests are approximate — the real count comes from XML parsing in full-extract mode.

### 3.3 Arrangement Deduplication

Both use a `seenArrNames` set to prevent duplicate arrangement listings. Python's set is case-insensitive for comparison? Let me check — both use string equality. Python lowercases for comparison:
```python
if arr_name.lower() not in seen:
    seen.add(arr_name.lower())
```
TS doesn't normalize case. "lead" and "Lead" would be treated as different arrangements under TS.

---

## 4. SNG Binary Parsing

### 4.1 Instrumental SNG

**Neither backend has a built-in instrumental SNG parser.**

Both rely on the external `RsCli` tool for SNG→XML conversion. Python integrates it directly into `load_song()`. TypeScript does not call it at all — there's no `RsCli` integration in the TS backend.

### 4.2 Vocals SNG

**Python** has a complete SNG vocals parser in `lib/sng_vocals.py`:
- AES-CTR decryption (PC key or Mac key)
- zlib decompression
- Binary layout: 4 zero-u32s, vocal count, 60-byte entries
- Each entry: float32 time, int32 note, float32 length, 48-byte UTF-8 lyric
- Uses `pycryptodome` (no pure-Python fallback)

**TypeScript has no SNG vocals parser.**

**Impact**: Lyrics from SNG-based vocal tracks are never extracted by the TS backend.

---

## 5. Sloppak Parsing

### 5.1 Format Detection

| Aspect | Python | TypeScript |
|--------|--------|------------|
| Case sensitivity | Case-insensitive (`.endswith(".sloppak")`) | **Case-sensitive** (`endsWith(".sloppak")`) |
| Magic byte check | None | None |

**Impact**: `File.SLOPPAK` on case-sensitive filesystems would be missed by TS.

### 5.2 Zip Cache Staleness

**Python** tracks mtime+size and re-extracts when changed:
```python
cached = _source_cache.get(key)
if cached and cached["mtime"] == path.stat().st_mtime and cached["size"] == path.stat().st_size:
    return cached["source_dir"]
```

**TypeScript** only checks if `manifest.yaml` exists in the cache dir. It does NOT verify staleness — an updated sloppak zip is never re-extracted.

### 5.3 Manifest YAML

**Python** tries both `manifest.yaml` and `manifest.yml`. Validates top-level is a dict.

**TypeScript** only tries `manifest.yaml`. No type validation on the parsed result.

### 5.4 Beats/Sections from Arrangement JSON

**Python** reads beats and sections from each arrangement's wire-format JSON:
```python
for b in data.get("beats", []) or []:
    song.beats.append(Beat(time=b.get("time", 0.0), measure=b.get("measure", -1)))
```

**TypeScript does NOT** — `SloppakLoader.load()` calls `arrangementFromWireJson()` which ignores beats/sections in the JSON. The `Song.beats` and `Song.sections` arrays remain empty.

**Impact**: Sloppak songs that embed beats/sections in the arrangement JSON files (common for GP-imported sloppaks) will have no beat/section data in the TS backend.

### 5.5 Stem Default Detection

**Python** parses stem defaults with string falsy handling:
```python
if isinstance(default_val, str):
    default_on = default_val.lower() not in ("off", "false", "0", "no")
else:
    default_on = bool(default_val)
```

**TypeScript** `s.default ?? false`: if the value is `"false"` (string), it's truthy and treated as `true`. **Only `null`/`undefined` produces `false`.**

**Impact**: A sloppak manifest with `default: "false"` strings (from YAML quoting) would be interpreted as default-on in TS but default-off in Python.

### 5.6 Tuning Detection for Library Index

**Python** (`_tuning_for_meta`) prefers guitar arrangements:
```python
for entry in arrangements_manifest:
    name = str(entry.get("name", "")).lower()
    tun = entry.get("tuning")
    if tun and isinstance(tun, list) and name in ("lead", "rhythm", "combo"):
        return list(tun)
```

**TypeScript** (`SloppakLoader.extractMeta`) uses the first arrangement's tuning:
```typescript
const tuning = manifest.arrangements?.[0]?.tuning;
```

**Impact**: If the first arrangement in the manifest is Bass (E Standard) but there's a Lead arrangement in Drop D, the library will display "E Standard" (TS) instead of "Drop D" (Python).

---

## 6. Loose Folder Parsing

### 6.1 Format Detection

| Check | Python | TypeScript |
|-------|--------|------------|
| Must be a directory | Yes | No (just `readdirSync`) |
| Must have WEM audio | Yes (excludes previews) | Yes (any `.wem` including previews) |
| Must have `<song>` XML | Yes (validates root tag) | Yes (any `.xml` file) |
| Symlinks must not escape | Yes (`_iter_local()`) | **No** |

**Impact**: TS is more permissive — it would accept directories with symlinks-escaped files, preview-only WEMs, and non-song XMLs.

### 6.2 Multiple Arrangement Detection

**Python** detects multiple arrangements from all XML files, assigns correct names via filename keywords and XML arrangement tags, and ranks by priority.

**TypeScript** returns a single arrangement named "Lead" from the first XML file.

**Impact**: Loose folders with multiple instrument tracks (Lead + Rhythm + Bass) only expose one arrangement in the TS backend.

### 6.3 Artist/Album Inference

**Python** infers artist from 3-level-deep folder path and album from 2-level-deep:
```python
title = path.stem
artist = path.parent.parent.stem  # e.g. dlc/Artist/Album/Song/
album = path.parent.stem
```

**TypeScript** does no folder inference — artist/album remain empty unless found in manifest.json or XML.

### 6.4 manifest.json Support

**Python** reads `manifest.json` from loose folders for metadata overrides. **TypeScript does not.**

### 6.5 Audio Discovery

**Python** prefers `audio.wem` / `song.wem` by name, falls back to largest non-preview `.wem`.

**TypeScript** (`findWemFiles`) finds ALL `.wem` files recursively, sorted by size descending. No preview exclusion, no name-based preference.

---

## 7. Wire Format Incompatibilities

These are **critical** — they mean sloppaks created by the TS backend cannot be read by the Python backend, and vice versa.

### 7.1 Note Wire Format

| Field | Python Key | TS Key | Direction |
|-------|-----------|--------|-----------|
| slideUnpitchTo | `slu` | `sl2` | Python writes `slu`, TS reads `sl2` |
| mute | `mt` | `mu` | Python writes `mt`, TS reads `mu` |
| tap | `tp` | `tap` | Python writes `tp`, TS reads `tap` |

### 7.2 Chord Template Wire Format

| Field | Python Key | TS Key |
|-------|-----------|--------|
| Container name | `templates` | `chord_templates` |
| Display name fallback | `displayName` or `name` (always present) | `displayName` (only when truthy) |
| JSON keys inside template | `name, displayName, fingers, frets, arp` | same |
| Fingers/frets length | Dynamic (extended range) | Fixed 6 |

### 7.3 HandShape Wire Format (in phrase levels)

| Field | Python Key | TS Key |
|-------|-----------|--------|
| chordId | `chord_id` | `id` |
| startTime | `start_time` | `st` |
| endTime | `end_time` | `et` |
| arpeggio | `arp` | `arp` |

### 7.4 PhraseLevel Wire Format

| Field | Python Key | TS Key |
|-------|-----------|--------|
| handShapes | `hand_shapes` | `handshapes` |

### Summary of Breaking Incompatibilities

A sloppak written by the **Python** backend's `arrangement_to_wire()` will have:
- `slu` (TS reads `sl2` → defaults to -1 → slide data lost)
- `mt` (TS reads `mu` → defaults to false → mute flag lost)
- `tp` (TS reads `tap` → defaults to false → tap flag lost)
- `templates` (TS reads `chord_templates` → empty array → all chord templates lost)
- `chord_id`, `start_time`, `end_time` in handshapes (TS reads `id`, `st`, `et` → handshapes silently parsed wrong)
- `hand_shapes` in phrase levels (TS reads `handshapes` → empty → handshapes lost)

A sloppak written by the **TypeScript** backend's `arrangementToWireJson()` will have:
- `sl2` (Python reads `slu` → defaults to -1 → slide data lost)
- `mu` (Python reads `mt` → defaults to false → mute flag lost)
- `tap` (Python reads `tp` → defaults to false → tap flag lost)
- `chord_templates` (Python reads `templates` → empty → all chord templates lost)

**These must be resolved before the TS backend can produce sloppaks that interoperate with Python, or before Python-generated sloppaks can be read by TS.**

---

## 8. Tuning Name Resolution

### 8.1 Named Tunings

Both backends support identical named tuning sets (E Standard, Eb Standard, Drop D, Open G, DADGAD, etc.). The note-name algorithm handles negative modulo correctly in both languages.

### 8.2 Extended-Range Fallback

Both fall back to space-separated numeric offsets when len(offsets) != 6 or no named pattern matches.

### 8.3 tuningSortKey

Both compute `sum(offsets)` for sort ordering. Identical.

---

## 9. Audio Pipeline

### 9.1 WEM→MP3 Conversion

**Python** uses vgmstream-cli → WAV → ffmpeg MP3 as the preferred path, with fallbacks to ffmpeg direct, ww2ogg, and pure-Python wem_decode.

**TypeScript** uses vgmstream-cli → WAV → ffmpeg MP3. No fallback chain.

### 9.2 Cache Eviction

**Python** evicts at >100 files, LRU by atime.
**TypeScript** evicts by mtime (oldest files first).

### 9.3 Concurrent Safety

**Python** writes to a temp file with UUID suffix, then atomically renames to the final name. **TypeScript** writes directly.

**Impact**: Two concurrent requests for the same song could race on the same output file in TS.

---

## 10. NaN/Infinity Protection

**Python** has `_sanitized_song_offset()` that converts NaN/Inf to 0.0 in the highway WebSocket. The `_coerce_duration()` helper in loosefolder parsing also guards against infinite values.

**TypeScript** has partial protection — the highway WebSocket handler doesn't have an explicit NaN guard for offset. The `num()` parser helper catches NaN via `isNaN(n)` and returns the fallback. But at the Song model level, `songLength: number` and `offset: number` can theoretically carry NaN from malformed XMLs.

---

## Summary of Gaps by Severity

### Critical (data loss or wrong behavior)

| # | Gap | Component | Impact |
|---|-----|-----------|--------|
| C1 | Wire format key mismatches (`slu`/`sl2`, `mt`/`mu`, `tp`/`tap`) | Wire format | Sloppak interoperability broken |
| C2 | Chord template container key (`templates` vs `chord_templates`) | Wire format | All chord templates lost cross-backend |
| C3 | HandShape wire keys (`chord_id`/`id`, `start_time`/`st`, `end_time`/`et`) | Wire format | HandShapes corrupt cross-backend |
| C4 | HandShape Level key (`hand_shapes` vs `handshapes`) | Wire format | HandShapes lost cross-backend |
| C5 | No SNG→XML conversion (RsCli) | PSARC extraction | SNG-only songs unplayable |
| C6 | No SNG vocals parsing | SNG extraction | Lyrics never extracted from SNG |

### High (incorrect behavior for edge cases)

| # | Gap | Component | Impact |
|---|-----|-----------|--------|
| H1 | Hardcoded 6-string tuning | XML parsing | 7/8-string/5-string bass tuning truncated |
| H2 | No chord template note synthesis | XML parsing | Template-only chords have no notes |
| H3 | Missing multi-casing for arpeggio flags | XML parsing | Arpeggio marking lost in some authoring tools |
| H4 | No arrangement name mapping | XML parsing | Arrangement names may be `"PART REAL_BASS"` instead of `"Bass"` |
| H5 | No arrangement sorting | XML parsing | Arrangement order different from Python |
| H6 | No beats/sections from sloppak JSON | Sloppak loading | Beat/section data missing for GP-imported sloppaks |
| H7 | No lyrics detection in PSARC scan | Metadata extraction | `hasLyrics` always false for PSARC |
| H8 | No PSARC metadata fallback to full extract | Metadata extraction | Missing manifest metadata = empty song entry |

### Medium (behavioral differences)

| # | Gap | Component | Impact |
|---|-----|-----------|--------|
| M1 | No sloppak zip staleness check | Sloppak loading | Updated sloppak zips never re-extracted |
| M2 | Case-sensitive sloppak detection | Sloppak loading | `.SLOPPAK` files missed on case-sensitive FS |
| M3 | Strict boolean parsing (`"yes"` → false) | XML parsing | Some edge-case XMLs misparsed |
| M4 | Loose folder single arrangement | Loose folder | Multi-track folders lose tracks |
| M5 | No loose folder artist/album inference | Loose folder | Artist/album empty for unannotated folders |
| M6 | No sloppak `.yml` fallback | Sloppak loading | `.yml` manifests not found |
| M7 | String stem default handling | Sloppak loading | `default: "false"` treated as truthy |
| M8 | No concurrent audio write safety | Audio pipeline | Race condition on audio cache |
| M9 | Stricter boolean syntax | XML parsing | `hammerOn="yes"` not accepted |
