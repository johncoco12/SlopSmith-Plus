# Plugin Development Guide

This guide walks through creating a SlopSmith plugin from scratch. Plugins live in the user plugin directory and are discovered automatically at server start.

---

## Directory Structure

A plugin is a folder containing at minimum a `plugin.json` manifest:

```
my-plugin/
├── plugin.json          # required — manifest
├── server.ts            # optional — backend module
├── component.vue        # optional — frontend Vue SFC
├── screen.html          # optional — fallback HTML view
└── settings.html        # optional — settings page HTML
```

Place the folder in the configured user plugins directory (default: `~/.slopsmith/plugins/`).

---

## The Manifest (`plugin.json`)

```jsonc
{
  "id": "my-plugin",          // unique, kebab-case
  "name": "My Plugin",
  "version": "1.0.0",
  "type": "visualization",    // visualization | provider | (omit for generic)

  // Backend
  "script": "./server.ts",    // backend module with setup() export
  "routes": [],               // declared for documentation; registered inside setup()

  // Frontend
  "component": "./component.vue",   // Vue SFC path
  "screen": "./screen.html",        // fallback if no component
  "settings": "./settings.html",    // settings page

  // Navigation
  "nav": {
    "label": "My Plugin",
    "icon": "puzzle-piece",   // any Heroicon name
    "order": 50
  },

  // Dependency ordering
  "dependsOn": ["other-plugin-id"],

  // Flags
  "bundled": false,   // true for built-in plugins
  "private": false    // true to hide from UI listings
}
```

Only `id`, `name`, and `version` are required. Add only the fields your plugin uses.

---

## Backend Module

Export `setup` and optionally `teardown`. The runtime calls these during lifecycle transitions.

```typescript
// server.ts
import type { PluginModule } from '@slopsmith/plugin-types'

export const plugin: PluginModule = {
  async setup(ctx) {
    // Register an HTTP route
    ctx.routes.register('GET', '/hello', async (req, reply) => {
      return { message: 'Hello from my-plugin!' }
    })

    // Subscribe to a hook
    ctx.hooks.on('song:play', async ({ songId }) => {
      ctx.logger.info(`Song started: ${songId}`)
    })

    // Persist some data
    await ctx.db.set('initialized', true)
  },

  async teardown(ctx) {
    // Clean up resources — hooks and routes are removed automatically
    ctx.logger.info('my-plugin unloaded')
  }
}
```

### PluginContext at a glance

| Property | Type | Purpose |
|---|---|---|
| `ctx.pluginId` | `string` | This plugin's ID |
| `ctx.pluginDir` | `string` | Absolute path to the plugin folder |
| `ctx.config` | `AppConfig` | Global app configuration |
| `ctx.hooks.on(event, handler)` | — | Subscribe to a lifecycle event |
| `ctx.hooks.once(event, handler)` | — | Subscribe once |
| `ctx.hooks.off(event, handler)` | — | Unsubscribe |
| `ctx.routes.register(method, path, handler)` | — | Register HTTP route (scoped to `/api/plugins/{id}/`) |
| `ctx.routes.ws(path, handler)` | — | Register WebSocket endpoint |
| `ctx.providers.register(type, name, impl)` | — | Register a provider implementation |
| `ctx.providers.get(type)` | — | Get the active provider |
| `ctx.db.get/set/delete/list(key)` | `Promise` | Scoped key-value storage |
| `ctx.permissions.define(name, description)` | — | Declare a custom permission |
| `ctx.logger` | `Logger` | Structured logger |

---

## Frontend Module

The Vue SFC can export a `setup` function for programmatic initialization:

```vue
<!-- component.vue -->
<template>
  <div class="my-plugin">
    <h2>{{ title }}</h2>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { FrontendPluginContext } from '@/plugins/FrontendPluginContext'

// The host calls this before mounting
export async function setup(ctx: FrontendPluginContext) {
  // Register into a UI slot
  ctx.slots.register('player-overlay', MyOverlayComponent, { order: 10 })

  // Subscribe to events
  ctx.events.on('song:play', ({ songId }) => {
    console.log('Playing:', songId)
  })
}

const title = ref('My Plugin')
</script>
```

If `setup` is not needed, just ship a plain Vue SFC — the loader will import and render it without calling setup.

### FrontendPluginContext at a glance

| Property | Purpose |
|---|---|
| `ctx.pluginId` | This plugin's ID |
| `ctx.events.on(event, handler)` | Subscribe to frontend events |
| `ctx.events.once(event, handler)` | Subscribe once |
| `ctx.events.emit(event, detail)` | Emit a custom event |
| `ctx.slots.register(slot, component, opts?)` | Inject a component into a named UI slot |
| `ctx.api.get/post/patch/delete(path, body?)` | Call this plugin's backend routes |

---

## Registering a Provider

Providers let a plugin offer a swappable implementation of a backend service. Example: a cloud storage backend.

```typescript
// server.ts
import type { IStorageProvider } from '@slopsmith/core'

export const plugin: PluginModule = {
  async setup(ctx) {
    const s3Storage: IStorageProvider = {
      async read(path) { /* ... */ },
      async write(path, data) { /* ... */ },
      async delete(path) { /* ... */ },
    }

    ctx.providers.register('storage', 's3', s3Storage)
  }
}
```

Users switch the active provider via **Settings → Providers** or `PUT /api/plugins/providers/storage/active`.

---

## Defining Custom Permissions

```typescript
ctx.permissions.define('manage_settings', 'Allow user to modify plugin configuration')
```

The permission name is then referenced in route registration:

```typescript
ctx.routes.register('POST', '/config', handler, {
  permission: 'manage_settings'
})
```

---

## Frontend-Only Plugin (Script)

For simple browser-only plugins, skip the backend module entirely and point `script` at a plain JS/TS file:

```json
{
  "id": "my-script",
  "name": "My Script Plugin",
  "version": "1.0.0",
  "script": "./index.js"
}
```

```javascript
// index.js — loaded as a <script> tag
window.slopsmith.on('song:play', ({ songId }) => {
  console.log('Playing:', songId)
})
```

Or export a `setup()` for the modern API:

```javascript
export async function setup(ctx) {
  ctx.events.on('song:play', ({ songId }) => {
    console.log('Playing:', songId)
  })
}
```

---

## Dependency Ordering

If your plugin depends on another, declare it in the manifest. The runtime will load dependencies before your plugin:

```json
{
  "dependsOn": ["themes", "storage-s3"]
}
```

Circular dependencies are detected at startup and will prevent all involved plugins from loading.

---

## Development Tips

- **Hot reload**: Disable and re-enable the plugin via `POST /api/plugins/{id}/enable` to reload it without restarting the server.
- **Logs**: All `ctx.logger` output is tagged with the plugin ID — grep for your ID in the server log.
- **DB inspection**: Use `ctx.db.list('')` to dump all stored keys for debugging.
- **Error isolation**: Uncaught errors inside hooks are caught by the host and logged — they do not crash the server or affect other plugins.

---

## See Also

- [Hook & Slot Reference](plugin-hooks-slots-reference.md)
- [Plugin API Reference](plugin-api-reference.md)
- [System Overview](plugin-system-overview.md)
