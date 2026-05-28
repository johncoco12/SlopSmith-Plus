# Hook & Slot Reference

---

## Backend Hooks

Hooks fire at well-defined lifecycle points. Plugins subscribe in `setup(ctx)` via `ctx.hooks.on(event, handler)`.

### Song Events

| Event | Payload | When it fires |
|---|---|---|
| `song:load` | `{ songId, profileId }` | A song is loaded into the player |
| `song:play` | `{ songId, profileId }` | Playback starts or resumes |
| `song:pause` | `{ songId, profileId, positionMs }` | Playback pauses |
| `song:stop` | `{ songId, profileId }` | Playback stops (user action or end) |
| `song:end` | `{ songId, profileId, score? }` | Song finishes naturally |

### Note Events

| Event | Payload | When it fires |
|---|---|---|
| `note:hit` | `{ noteId, songId, accuracy }` | Player hits a note within tolerance |
| `note:miss` | `{ noteId, songId }` | Player misses a note |
| `note:sustain` | `{ noteId, songId, durationMs }` | A sustained note completes |

### Library Events

| Event | Payload | When it fires |
|---|---|---|
| `library:scan:start` | `{ profileId }` | Library scan begins |
| `library:scan:complete` | `{ profileId, added, removed }` | Scan finishes |
| `library:song:added` | `{ songId, profileId }` | A new song is added to the library |
| `library:song:removed` | `{ songId, profileId }` | A song is removed from the library |

### System Events

| Event | Payload | When it fires |
|---|---|---|
| `server:startup` | `{}` | Server finishes initialisation |
| `server:shutdown` | `{}` | Server begins graceful shutdown |
| `plugin:loaded` | `{ pluginId }` | A plugin reaches `active` state |
| `plugin:errored` | `{ pluginId, error }` | A plugin fails during setup |

### Hook Options

```typescript
ctx.hooks.on('song:play', handler, {
  phase: 'before',   // 'before' (default) | 'after'
  priority: 50,      // lower numbers run first, default 100
})
```

- **`phase: 'before'`** — Runs before the core action. The handler can set `abortSignal` to prevent downstream handlers and the action itself.
- **`phase: 'after'`** — Runs after the core action completes.
- **Priority** — Within a phase, handlers run in ascending priority order. Built-in handlers typically use priority 100.

### Custom Events

Emit and subscribe to arbitrary events using string event names. By convention, use `plugin-id:event-name` to avoid collisions:

```typescript
// emitting
ctx.hooks.emit('my-plugin:analysis-done', { result })

// subscribing
ctx.hooks.on('my-plugin:analysis-done', async ({ result }) => { … })
```

---

## Frontend Events

Frontend events are broadcast via `PluginEventBus`. Inside `FrontendPluginContext` use `ctx.events`; outside use the bus directly.

| Event | Payload | When it fires |
|---|---|---|
| `song:ready` | `{ songId }` | Song data loaded, player ready |
| `song:play` | `{ songId }` | Playback starts |
| `song:pause` | `{ songId }` | Playback pauses |
| `song:end` | `{ songId }` | Song finishes |
| `note:hit` | `{ noteId, accuracy }` | Note hit detected |
| `note:miss` | `{ noteId }` | Note miss detected |
| `plugins:ready` | `{}` | All plugins loaded |
| `plugin:register` | `{ pluginId }` | A single plugin finishes loading |

---

## UI Slots

Slots are named injection points in the host UI. Register a Vue component into a slot from a frontend plugin's `setup()`:

```typescript
ctx.slots.register('player-overlay', MyComponent, { order: 10 })
```

Lower `order` values render first. Default is `100`.

### Available Slots

| Slot name | Where it renders | Typical use |
|---|---|---|
| `visualization` | Main player canvas area | Custom 3D / 2D renderers |
| `player-overlay` | Overlay on top of the player | Tuner, lyrics, prompts |
| `player-controls` | Player control bar | Extra transport buttons |
| `settings-panel` | Settings page section | Plugin-specific settings UI |
| `nav-item` | App sidebar navigation | Deep-link to plugin view |
| `library-card-badge` | Song card in library grid | Rating, completion badge |
| `diagnostics-panel` | Diagnostics / debug page | Performance metrics, logs |

### Rendering a Slot in Host Views

```vue
<PluginSlot name="player-overlay" />
```

All components registered to the named slot are rendered in order. If no plugins have registered, the slot renders nothing.

---

## See Also

- [Plugin Development Guide](plugin-development-guide.md)
- [Plugin API Reference](plugin-api-reference.md)
