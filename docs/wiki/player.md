# Player & Highway

The player is the core of SlopSmith — it synchronises audio playback with a scrolling note highway and optionally detects your instrument's pitch in real time.

---

## Overview

```
GET /api/tracks/:trackId/highway?arrangement=N
        │
        ▼
  HighwayResponse (chart data)
  ├── notes, chords, anchors
  ├── beats, sections, phrases
  ├── chord templates, hand shapes
  ├── lyrics
  └── tone changes
        │
        ▼
  Frontend Player
  ├── <audio> element ── GET /api/tracks/:trackId/audio (OGG, range-supported)
  ├── Renderer (pluggable)
  │   ├── Highway 2D (Canvas 2D, default)
  │   ├── Modernway 3D (Three.js)
  │   └── TabMaster (tab notation)
  └── Pitch Detection (YIN WASM, optional)
```

All chart data is loaded once at song start — there is no streaming of note data during playback.

---

## Highway Response

`GET /api/tracks/:trackId/highway?arrangement=N`

`N` is the arrangement index (0-based) corresponding to the `arrangements` array in `SongMeta`. Omitting `N` returns the default arrangement (configured in settings, or the first available).

### Response shape

```ts
{
  song: SongInfo
  notes: Note[]
  chords: Chord[]
  anchors: Anchor[]
  handShapes: HandShape[]
  chordTemplates: ChordTemplate[]
  beats: Beat[]
  sections: Section[]
  phrases?: Phrase[]            // only present in PSARC / some Loose files
  lyrics?: Lyric[]
  toneChanges?: ToneChange[]
}
```

### SongInfo

```ts
{
  title: string
  artist: string
  album: string
  duration: number     // seconds
  tuning: number[]     // semitone offsets [E, A, D, G, B, e]
  capo: number
  arrangementName: string
}
```

---

## Wire Format (Chart Data)

To minimise response size, note fields use short names and boolean fields are omitted when false.

### Note

```ts
{
  t: number       // time (seconds)
  s: number       // string (0 = low E, 5 = high e)
  f: number       // fret
  sus?: number    // sustain duration (omitted if 0)
  sl?: number     // slide-to fret (pitched)
  sl2?: number    // slide-to fret (unpitched)
  bn?: number     // bend (semitones)
  ho?: true       // hammer-on
  po?: true       // pull-off
  harm?: true     // natural harmonic
  pharm?: true    // pinch harmonic
  vib?: true      // vibrato
  tap?: true      // tap
  mute?: true     // palm mute
}
```

### Chord

```ts
{
  t: number           // time
  id: number          // index into chordTemplates
  hd?: true           // high density (arpeggiated)
  notes: Note[]       // individual notes in the chord
}
```

### ChordTemplate

```ts
{
  name: string          // e.g. "Em7"
  displayName: string   // e.g. "Em7" or ""
  frets: number[]       // fret per string (-1 = muted)
  fingers: number[]     // finger number per string (0 = open)
  arpeggio: boolean
}
```

### Anchor

Defines the fretting-hand position window — drives the highway zoom box.

```ts
{
  time: number
  fret: number    // lowest fret of the window
  width: number   // number of frets in the window (usually 4)
}
```

### HandShape

Marks a chord hold span for visual emphasis (sustain ring on the highway).

```ts
{
  chordId: number
  startTime: number
  endTime: number
}
```

### Beat

```ts
{
  time: number
  measure: number   // -1 for sub-beats, ≥1 for measure numbers
}
```

### Section

```ts
{
  name: string      // e.g. "verse", "chorus", "bridge"
  number: number    // occurrence number (verse 1, verse 2, …)
  time: number
}
```

### Phrase (difficulty ladder)

Present only in files sourced from Rocksmith XML. Enables the mastery/difficulty slider.

```ts
{
  name: string
  maxDifficulty: number
  disparity: boolean
  solo: boolean
  ignore: boolean
  startTime: number
  endTime: number
}
```

### Lyric

```ts
{
  t: number    // start time
  d: number    // duration
  w: string    // word fragment ("-" suffix = continues on same line, "+" = line break)
}
```

### ToneChange

```ts
{
  time: number
  name: string    // e.g. "Clean Rhythm", "Lead Drive"
}
```

---

## Renderers

Three rendering engines are available. The user can switch between them in profile settings.

### Highway 2D (default)

- Canvas 2D renderer
- Six string lanes, fret markers, note gems
- Sustain tails, bend indicators, technique icons
- Lightweight — suitable for any hardware

### Modernway 3D

- Three.js / TresJS renderer
- Depth perspective highway with per-string colour lighting
- Animated note approach, chord indicators
- Requires a capable GPU

### TabMaster

- Classic tab notation view
- Scrolls horizontally in sync with playback
- Useful when learning specific fingering from a static reading perspective

The renderer is selected via the `RendererManager` on the `PlayerCanvas.vue` component. Plugins can register additional renderers into the `visualization` UI slot — see [Plugin Hooks & Slots Reference](plugin-hooks-slots-reference.md).

---

## Pitch Detection

Optional real-time pitch detection using the **YIN algorithm** compiled to WebAssembly.

**How to enable**: Click the microphone icon in the player controls or toggle in audio settings.

**Flow**:
1. Browser requests microphone access (`getUserMedia`)
2. Audio frames are passed to the YIN WASM module each animation frame
3. Detected fundamental frequency is compared to the expected note frequency (accounting for tuning offsets and capo)
4. Hit / miss events are emitted via the frontend event bus
5. Hit/miss events can be consumed by plugins (e.g., a score overlay)

**Note tolerance**: A hit is registered when the detected pitch is within ±25 cents of the target note frequency.

---

## Mastery & Difficulty

If phrase data is present (Rocksmith XML songs), the **mastery slider** (0–100%) dynamically filters notes to a difficulty level proportional to the mastery percentage.

- 0% mastery → only the easiest difficulty notes are shown (great for beginners)
- 100% mastery → all notes shown (full chart)
- The slider jumps in discrete steps matching the phrase's `maxDifficulty`

Songs without phrase data (most Sloppaks) always show the full chart.

---

## A-B Looping

Users can mark a loop start (A) and end (B) within a song. When playback reaches B, it jumps back to A seamlessly.

Loops are saved per profile + track and can be given custom names.

**API**:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tracks/:trackId/loops?profileId=N` | List loops for this track |
| `POST` | `/api/tracks/:trackId/loops` | Create loop `{ name, start_time, end_time }` |
| `DELETE` | `/api/loops/:id` | Delete a loop |

Default name: `"Loop 1"`, `"Loop 2"`, etc. (auto-incremented).

---

## Scoring

After completing a song, a score (0–100) is submitted.

`POST /api/tracks/:trackId/score`

```json
{ "profileId": 2, "score": 87 }
```

The backend stores the **best score** per profile + track (never decrements), increments `playCount`, and updates `lastPlayedAt`. It also emits the `track:score:submitted` hook for plugins.

To fetch scores for multiple tracks in one round-trip:

`POST /api/scores/batch`

```json
{ "profileId": 2, "trackIds": ["abc", "def", "ghi"] }
```

---

## Player Controls Reference

| Control | Description |
|---|---|
| Play / Pause | Spacebar or button |
| Seek | Click/drag progress bar |
| Speed | 0.25× – 1.5× (pitch-corrected via rubberband) |
| Volume | Master volume slider |
| Arrangement | Switch Lead / Rhythm / Bass mid-song |
| Lyrics | Toggle lyrics overlay |
| Mastery | Difficulty slider (phrase songs only) |
| A-B Loop | Set A point, set B point, clear loop |
| Pitch Detection | Microphone toggle |

---

## Audio Delivery

`GET /api/tracks/:trackId/audio`

- Returns OGG audio with full HTTP range support (206 Partial Content).
- The frontend `<audio>` element seeks by requesting byte ranges, enabling near-instant scrubbing.
- Per-instrument stems: `GET /api/tracks/:trackId/stems/:stemIndex/audio` (OGG).

---

## See Also

- [Library System](library.md)
- [SlopPak Format](sloppak-format.md)
- [VST Plugin Chain](plugin-chain-vst.md)
- [Plugin Hooks & Slots Reference](plugin-hooks-slots-reference.md)
