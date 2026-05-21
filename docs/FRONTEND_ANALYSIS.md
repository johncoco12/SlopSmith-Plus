# Slopsmith Frontend Analysis

Reference document for the Vue rewrite. Covers every screen, feature, component, API call, and style decision in the original vanilla-JS frontend.

---

## Screens

| Screen | Route (Vue) | Notes |
|--------|-------------|-------|
| Library | `/` | Main song browser |
| Favorites | `/favorites` | Favorited songs only — same UI as Library |
| Player | `/player/:filename` | Full-screen canvas highway |
| Settings | `/settings` | App + plugin config |
| Plugin screens | `/plugin/:id` | Dynamically injected by plugins |

---

## Library / Favorites

### View modes
- **Grid** — paginated card grid (24 cards/page), infinite scroll via IntersectionObserver
- **Tree** — hierarchical artist → album → song list with expand/collapse; letter filter; pagination

### Sort options
`artist` · `artist-desc` · `title` · `title-desc` · `recent` · `year-desc` · `year` · `tuning`

### Format filter
`all` · `psarc` · `sloppak` · `loose`

### Advanced filters (FilterDrawer)
- **Arrangements** — Lead / Rhythm / Bass — 3-state: any → require → exclude (green/red pill)
- **Stems** — sloppak only — same 3-state cycling
- **Lyrics** — has / lacks toggle
- **Tunings** — collapsible multi-select list with counts

### Active filter chips
Strips showing each active filter with ✕ to remove individually, plus "Clear all".

### Search
Real-time debounced text filter (250 ms).

### Song selection
- Click to select; arrow keys navigate; Enter/Space opens player
- Selection persisted to `localStorage` per screen
- Scroll-to-selection on screen re-entry (keep-alive)

### Favorites toggle
Heart icon on each card; calls `POST /api/favorites/toggle`.

---

## Player

### Layout
Full-viewport `position: fixed; inset: 0; display: flex; flex-direction: column`.  
`#highway` canvas fills remaining space (`flex: 1`).  
Controls bar sits at the bottom.

### HUD (top overlay)
- Top-left: Artist — Title, arrangement name
- Top-right: `currentTime / duration` (tabular-nums)
- A/V offset indicator (hidden when 0 ms)

### Controls bar
| Control | Details |
|---------|---------|
| ⏪ 5s | Seek −5 s |
| ▶ / ⏸ | Play / Pause |
| 5s ⏩ | Seek +5 s |
| Arrangement | Dropdown to switch arrangement |
| Speed | Range 25 %–150 %, 5 % steps |
| Mastery | Difficulty filter 0–100 % |
| A/V Offset | Range ±1000 ms; `[`/`]` keys ±10 ms, Shift ±50 ms |
| Mixer | Popover with per-stem faders |
| Lyrics | Toggle on/off |
| Quality | HD / Medium / Low |
| Visualization | Auto / Default / plugin renderers |
| Loop A/B | Set start/end markers |
| Save Loop | Persist named loop |
| Clear Loop | Remove active loop |
| Saved Loops | Dropdown to load previously saved loops |
| ✕ Close | Return to previous screen |

### Keyboard shortcuts (player scope)
| Key | Action |
|-----|--------|
| Space | Play/Pause |
| ← / → | Seek ±5 s |
| Shift+← / → | Seek ±30 s |
| `[` / `]` | A/V offset ±10 ms |
| Shift+`[`/`]` | A/V offset ±50 ms |
| `0` | Reset A/V offset |
| `\` | Toggle lyrics |
| `m` | Toggle mixer |
| `d` | Cycle quality |
| `v` | Cycle visualization |

---

## Settings

### Sections
1. **DLC Folder** — text input + save; desktop uses `window.slopsmithDesktop.pickDirectory`
2. **Left-handed mode** — checkbox → `highway.setLefty()`
3. **Default Arrangement** — select: Lead / Rhythm / Bass / Auto
4. **A/V Sync Offset** — range ±1000 ms
5. **PSARC Platform Filter** — All / PC only / Mac only
6. **Demucs Server URL** — optional remote stem separation
7. **Library Actions** — Rescan (incremental), Full Rescan; status text below
8. **Backup** — Export Settings (JSON download) / Import Settings (file upload)
9. **Diagnostics** — checkboxes (system info, logs, console, plugins), Preview/Export ZIP
10. **Plugin Settings** — collapsible per-plugin section injected dynamically
11. **About** — version, license link, source link

---

## Plugin system

- Plugins loaded from `GET /api/plugins` → list of manifests
- Each plugin's `screen.js` injected as a `<script>` tag
- Nav items added to `#nav-plugins` for plugins that declare `nav`
- Visualization plugins register `window.slopsmithViz_<id>` factory
- Audio faders registered via `window.slopsmith.audio.registerFader(spec)`
- Settings UI injected into `#plugin-settings-area` per plugin
- Frontend diagnostics: `window.slopsmith.diagnostics.contribute(id, payload)`

---

## API Endpoints

### Library
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/library/grid` | Paginated songs (query, sort, format, arrangements, stems, lyrics, tunings, offset, limit, favorites) |
| GET | `/api/library/stats` | Total count + tree stats (`?favorites=0\|1`) |
| GET | `/api/library/tuning-names` | List of tuning name strings |
| POST | `/api/favorites/toggle` | Toggle favorite `{filename}` |

### Settings & Scan
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/settings` | Load settings |
| POST | `/api/settings` | Save settings |
| GET | `/api/settings/export` | Download settings JSON |
| POST | `/api/settings/import` | Upload + merge settings |
| GET | `/api/version` | `{version, source_url, license_url}` |
| POST | `/api/rescan` | Incremental library scan |
| POST | `/api/rescan/full` | Full cache-clear rescan |
| GET | `/api/scan-status` | `{scanning, status, message, progress}` |

### Plugins
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/plugins` | All plugin manifests |
| GET | `/api/plugins/:id/updates` | Available updates |
| POST | `/api/plugins/:id/update` | Upgrade plugin |
| GET | `/api/startup-status` | `{phase, running, error}` |

### Loops
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/loops?filename=` | Saved loops for a song |
| POST | `/api/loops` | Save loop `{songFilename, name, start, end, arrangement}` |
| DELETE | `/api/loops/:id` | Delete loop |

### WebSocket
`/ws/highway/{filename}?arrangement={index}` — streams chart data in order:
`loading` → `song_info` → `beats` → `sections` → `anchors` → `chord_templates` → `lyrics` → `tone_changes` → `notes` → `chords` → `phrases` → `ready`

---

## localStorage Keys

| Key | Default | Purpose |
|-----|---------|---------|
| `slopsmith.libView` | `grid` | Library view mode |
| `slopsmith.libSort` | `artist` | Sort option |
| `slopsmith.libFormat` | `''` | Format filter |
| `slopsmith.libFilters` | `{}` | Advanced filter state |
| `slopsmith.libLastSelected` | `null` | Last selected library item |
| `slopsmith.favLastSelected` | `null` | Last selected favorite item |
| `slopsmith.libTreeExpand` | `'1'` | Tree expand state |
| `slopsmith.favTreeExpand` | `'1'` | Favorites tree expand state |
| `avOffset` | `0` | A/V sync offset ms |
| `masterDifficulty` | `100` | Mastery filter % |
| `vizSelection` | `auto` | Visualization picker selection |
| `showLyrics` | `true` | Lyrics visibility |
| `volume` | `100` | Master audio volume |

---

## Colour Palette

| Token | Value | Usage |
|-------|-------|-------|
| `dark-800` | `#111111` | Page background |
| `dark-700` | `#161616` | Card/panel background |
| `dark-600` | `#1e1e1e` | Input/control background |
| `dark-500` | `#2a2a2a` | Hover background |
| `accent` | `#4080e0` | Primary button, selection ring, logo |
| `gold` | `#e8c040` | Gold star, highlights |
| `gray-200` | `#e5e7eb` | Primary text |
| `gray-400` | `#9ca3af` | Secondary text |
| `gray-500` | `#6b7280` | Muted/placeholder text |
| `green-500` | `#22c55e` | "Require" filter state |
| `red-500` | `#ef4444` | "Exclude" filter state |

### String colours (highway renderer)
| String | Colour |
|--------|--------|
| 1 (high e) | `#ff4444` |
| 2 (B) | `#ffaa00` |
| 3 (G) | `#ffff00` |
| 4 (D) | `#00ff00` |
| 5 (A) | `#00aaff` |
| 6 (low E) | `#aa44ff` |

---

## Highway Renderer

`highway.js` exports `window.createHighway()` — a plain global function.  
The returned API object:

```
highway.reconnect(filename, arrangement)  load chart via WebSocket
highway.stop()                            teardown, cancel rAF
highway.togglePlay()                      play/pause shim
highway.getAudioElement()                 returns <audio> or JUCE shim
highway.getTime()                         interpolated chart time
highway.setTime(t)
highway.setRenderer(instance)            install custom renderer (null = default)
highway.isDefaultRenderer()
highway.setVisible(bool|null)
highway.addDrawHook(fn)                  (ctx, W, H) overlay hook
highway.fireDrawHooks(ctx, W, H)
highway.setNoteStateProvider(fn)
highway.setAvOffset(ms)
highway.getBeats() / getNotes() / getChords() / getSections() / ...
highway.setMasterDifficulty(0-1)
highway.setLoop(a, b)
highway.setLefty(bool)
```

`createHighway()` looks for `<canvas id="highway">` in the DOM — the element must exist before the call.

---

## Global JS files (not converted to Vue modules)

These are plain scripts loaded via `<script>` in `index.html` and set window globals.  
They are copied to `vue-frontend/public/` so Vite serves them unmodified.

| File | Global | Purpose |
|------|--------|---------|
| `highway.js` | `window.createHighway` | Canvas note highway |
| `audio-mixer.js` | `window.slopsmith.audio` | Mixer fader registry + popover |
| `diagnostics.js` | `window.slopsmith.diagnostics` | Console capture + bundle API |

---

## Vue Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| State management | Pinia | Vue-native, composition-friendly, lightweight |
| Routing | Vue Router 4 (hash mode) | No server config needed |
| Utilities | VueUse | Batteries-included composables (useLocalStorage, etc.) |
| Build | Vite | Fast, native ESM |
| CSS | Tailwind CSS v3 | Same as original, utility-first |
| Highway.js | Wrapped in `useHighway` composable | Complex canvas code, no value rewriting |
| Audio / Mixer | `audio-mixer.js` kept as plain script | Sets `window.slopsmith.audio` which plugins rely on |
| HTTP | Native `fetch` | No axios needed (YAGNI) |
