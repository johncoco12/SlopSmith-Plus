# Plugin API Reference

---

## REST Endpoints

All plugin endpoints are under `/api/plugins`. Endpoints that modify state require authentication.

### List Plugins

```
GET /api/plugins
```

Returns an array of all discovered plugins and their current state.

**Response**
```json
[
  {
    "id": "themes",
    "name": "Themes",
    "version": "1.2.0",
    "type": "provider",
    "state": "active",
    "bundled": true,
    "nav": { "label": "Themes", "icon": "swatch", "order": 80 }
  }
]
```

`state` is one of: `discovered`, `validating`, `loading`, `setting_up`, `active`, `tearing_down`, `disabled`, `errored`.

---

### Get Plugin

```
GET /api/plugins/:id
```

Returns detailed information for a single plugin including full manifest and current state.

---

### Serve Plugin Asset

```
GET /api/plugins/:id/file/*path
```

Serves a static file from the plugin's directory. No authentication required — used by the frontend to load plugin scripts and Vue components.

---

### Enable Plugin

```
POST /api/plugins/:id/enable
```

Marks the plugin as enabled in `disabled-plugins.json`. Takes effect on the next server restart.

**Response** `200 OK`

---

### Disable Plugin

```
POST /api/plugins/:id/disable
```

Marks the plugin as disabled. Takes effect on the next server restart.

**Response** `200 OK`

---

### List Providers

```
GET /api/plugins/providers
```

Returns all registered provider implementations grouped by type.

**Response**
```json
{
  "storage": [
    { "name": "local", "pluginId": "built-in-storage", "active": true },
    { "name": "s3",    "pluginId": "storage-s3",        "active": false }
  ],
  "metadata": [
    { "name": "musicbrainz", "pluginId": "metadata-mb", "active": true }
  ]
}
```

---

### Switch Active Provider

```
PUT /api/plugins/providers/:type/active
```

Changes the active provider for a given type. Requires the `settings` permission.

**Body**
```json
{ "name": "s3" }
```

**Response** `200 OK`

---

### Plugin Settings Page

```
GET /api/plugins/:id/settings
```

Returns the raw HTML defined in the plugin manifest's `settings` field. Rendered inside an `<iframe>` in the settings UI.

---

## Plugin-Scoped Routes

Each plugin's own HTTP and WebSocket routes are mounted under:

```
HTTP:      /api/plugins/{pluginId}/**
WebSocket: /ws/plugins/{pluginId}/**
```

For example, a plugin with ID `my-plugin` that calls `ctx.routes.register('GET', '/data', handler)` in its `setup()` will be reachable at:

```
GET /api/plugins/my-plugin/data
```

Authentication is applied automatically. Custom permission checks are optional per route.

---

## Backend PluginContext API

The `ctx` object passed to `plugin.setup(ctx)`.

### `ctx.hooks`

```typescript
ctx.hooks.on(event: HookEvent, handler: HookHandler, opts?: HookOptions): void
ctx.hooks.once(event: HookEvent, handler: HookHandler): void
ctx.hooks.off(event: HookEvent, handler: HookHandler): void
```

`HookOptions`:
```typescript
{
  phase?: 'before' | 'after'   // default 'before'
  priority?: number             // default 100, lower runs first
}
```

### `ctx.routes`

```typescript
ctx.routes.register(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  handler: RouteHandler,
  opts?: { permission?: string }
): void

ctx.routes.ws(path: string, handler: WsHandler): void
```

`path` is relative to `/api/plugins/{pluginId}/`.

### `ctx.providers`

```typescript
ctx.providers.register<T>(type: ProviderType, name: string, provider: T): void
ctx.providers.get<T>(type: ProviderType): T | null          // active provider
ctx.providers.getByName<T>(type: ProviderType, name: string): T | null
```

### `ctx.db`

```typescript
ctx.db.get(key: string): Promise<unknown>
ctx.db.set(key: string, value: unknown): Promise<void>
ctx.db.delete(key: string): Promise<void>
ctx.db.list(prefix: string): Promise<Array<{ key: string; value: unknown }>>
```

All keys are scoped to the plugin. Keys from different plugins never collide.

### `ctx.permissions`

```typescript
ctx.permissions.define(name: string, description: string): void
```

Defined permissions appear in the admin panel and can be assigned to users.

### `ctx.logger`

```typescript
ctx.logger.info(message: string, meta?: object): void
ctx.logger.warn(message: string, meta?: object): void
ctx.logger.error(message: string, meta?: object): void
```

Output is tagged with the plugin ID automatically.

---

## Frontend FrontendPluginContext API

Passed to `setup(ctx)` exported from a Vue SFC or script plugin.

### `ctx.events`

```typescript
ctx.events.on(event: string, handler: (detail: unknown) => void): () => void
ctx.events.once(event: string, handler: (detail: unknown) => void): () => void
ctx.events.emit(event: string, detail?: unknown): void
```

`on` returns an unsubscribe function.

### `ctx.slots`

```typescript
ctx.slots.register(
  slot: SlotName,
  component: Component,
  opts?: { order?: number }
): void
```

### `ctx.api`

Preconfigured fetch wrapper scoped to `/api/plugins/{pluginId}/`:

```typescript
ctx.api.get(path: string): Promise<unknown>
ctx.api.post(path: string, body?: unknown): Promise<unknown>
ctx.api.patch(path: string, body?: unknown): Promise<unknown>
ctx.api.delete(path: string): Promise<unknown>
```

---

## Legacy Global API

Scripts that use the legacy `window.slopsmith` surface:

```javascript
window.slopsmith.on(event, handler)
window.slopsmith.once(event, handler)
window.slopsmith.emit(event, detail)
```

This maps directly to `PluginEventBus` under the hood. New plugins should use the `FrontendPluginContext` API instead.

---

## See Also

- [Plugin Development Guide](plugin-development-guide.md)
- [Hook & Slot Reference](plugin-hooks-slots-reference.md)
- [VST Plugin Chain](plugin-chain-vst.md)
