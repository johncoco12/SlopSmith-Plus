# VST Plugin Chain & SlopAudio Connect

SlopSmith can display and control a real-time VST3 audio processing chain running inside **SlopAudio Connect** (SAC). This page covers how the two systems communicate, what you can control, and how to extend or build on top of the integration.

---

## Overview

```
Your Guitar / Instrument
        │
        ▼
┌───────────────────────────────┐
│      SlopAudio Connect        │  ← standalone JUCE app
│                               │
│  Audio Input                  │
│     │                         │
│  [EQ Plugin]                  │
│  [Reverb Plugin]              │  ← VST3 plugin chain
│  [Pitch Shift Plugin]         │
│     │                         │
│  Audio Output                 │
│                               │
│  PluginChainProcessor         │
│  SessionController            │
└───────────┬───────────────────┘
            │ UDP 54921 (control) / 54922 (pitch)
            ▼
┌───────────────────────────────┐
│     SlopSmith Backend         │
│     SacSessionService         │  ← UDP ↔ WebSocket bridge
└───────────┬───────────────────┘
            │ WebSocket
            ▼
┌───────────────────────────────┐
│    SlopSmith Frontend         │
│    PluginChainPanel.vue       │  ← live chain UI
└───────────────────────────────┘
```

---

## Network Ports

| Port | Protocol | Direction | Purpose |
|---|---|---|---|
| 54920 | UDP broadcast | SAC → network | Beacon / discovery |
| 54921 | UDP | bidirectional | Control plane (commands + chain state) |
| 54922 | UDP | SAC → backend | Real-time pitch data |
| 54930 | UDP | backend → SAC | Backend receive port |

All communication is local (same machine or LAN). No internet connection required.

---

## Authentication

SAC and SlopSmith pair using a PIN code.

1. Generate a PIN in the SlopAudio Connect app.
2. Enter it in SlopSmith under **Settings → Audio**.
3. The backend validates the PIN hash + salt stored in the database.
4. Once authenticated, the session is active until SAC stops sending heartbeats (30 second timeout).

---

## Messages: SAC → Backend

| Message type | When SAC sends it | What happens |
|---|---|---|
| `CHAIN_STATE` | On connect, after any chain change, on request | Full JSON snapshot of the chain is forwarded to the frontend WebSocket |
| `PLUGIN_LIST` | After a VST scan | List of available VST3 plugins forwarded to frontend |
| `HEARTBEAT` | Every ~10 seconds | Keeps the session alive |

### CHAIN_STATE shape

```json
{
  "type": "CHAIN_STATE",
  "plugins": [
    {
      "id": "com.vendor.myplugin",
      "name": "My Plugin",
      "vendor": "Vendor",
      "bypassed": false,
      "parameters": [
        {
          "id": 0,
          "name": "Gain",
          "value": 0.75,
          "minValue": 0.0,
          "maxValue": 1.0,
          "steps": 0,         // 0 = continuous, 2 = boolean, >2 = discrete
          "label": "dB"
        }
      ]
    }
  ]
}
```

---

## Messages: Backend → SAC

These are sent from SlopSmith (frontend or backend logic) to control the chain in real time.

| Message type | Parameters | Effect |
|---|---|---|
| `SET_PARAMETER` | `pluginIndex`, `parameterId`, `value` | Updates a plugin parameter |
| `SET_BYPASS` | `pluginIndex`, `bypassed` | Enables or disables a plugin |
| `MOVE_PLUGIN` | `fromIndex`, `toIndex` | Reorders plugins in the chain |
| `REMOVE_PLUGIN` | `pluginIndex` | Removes a plugin from the chain |
| `ADD_PLUGIN` | `pluginId` | Adds a VST3 plugin by its ID |
| `REQUEST_CHAIN_STATE` | — | Asks SAC to resend the full CHAIN_STATE |

---

## SacSessionService (Backend)

Located at [backend/src/services/sac/SacSessionService.ts](../../backend/src/services/sac/SacSessionService.ts).

This service is the central relay. It:

- Listens on UDP 54921 for incoming SAC connections and heartbeats.
- Validates PIN on first contact and stores the session.
- When a frontend WebSocket connects, it calls `linkWs(sessionId, profileId, ws)` to bind that socket to the UDP session.
- Forwards CHAIN_STATE and PLUGIN_LIST from UDP to the linked WebSocket.
- Forwards control commands from WebSocket to SAC over UDP.
- Expires sessions that miss 3+ heartbeats.

### Public methods

```typescript
// Query sessions
sacService.getSessions(): SacSession[]
sacService.getSessionsForProfile(profileId: string): SacSession[]

// Chain control (called from frontend WebSocket messages)
sacService.sendSetParameter(sessionId, pluginIndex, parameterId, value): void
sacService.sendSetBypass(sessionId, pluginIndex, bypassed): void
sacService.sendMovePlugin(sessionId, fromIndex, toIndex): void
sacService.sendRemovePlugin(sessionId, pluginIndex): void
sacService.sendAddPlugin(sessionId, pluginId): void
sacService.requestChainState(sessionId): void

// WebSocket binding
sacService.linkWs(sessionId, profileId, ws): void
```

---

## PluginChainPanel (Frontend)

Located at [frontend/src/features/player/components/PluginChainPanel.vue](../../frontend/src/features/player/components/PluginChainPanel.vue).

Displays the live plugin chain received from SAC and provides controls:

- **Drag to reorder** — Drop a plugin row to a new position; sends `sac:move_plugin`.
- **Bypass toggle** — Power button icon; sends `sac:set_bypass`.
- **Remove** — Trash icon; sends `sac:remove_plugin`.
- **Add plugin** — Searchable dropdown from the PLUGIN_LIST; sends `sac:add_plugin`.
- **Parameters**:
  - `steps == 0` → continuous `<input type="range">` slider
  - `steps == 2` → toggle button (boolean)
  - `steps > 2` → discrete slider with step increment
- Parameter changes are **debounced at 40 ms** to avoid flooding SAC with UDP packets during drag.

---

## PluginChainProcessor (SAC / C++)

Located at `Source/Audio/PluginChainProcessor.h/cpp` in the SlopAudio Connect repository.

Manages the JUCE `AudioPluginInstance` chain on the audio thread:

- **Scanning** — Finds VST3 plugins in `~/.vst3`, `/usr/lib/vst3`, and system plugin paths.
- **Chain operations** — `addPlugin`, `removePlugin`, `movePlugin` (thread-safe via message queue).
- **Parameter updates** — Enqueued in a lock-free FIFO (`paramQueue`) to avoid audio-thread contention.
- **State serialization** — `serialiseChain()` produces the JSON sent as `CHAIN_STATE`.
- **Persistence** — Chain state saved/loaded via JUCE `ValueTree` so the chain survives app restarts.

---

## Extending the Integration

### Reacting to chain changes in a SlopSmith plugin

```typescript
// In a SlopSmith plugin's backend setup()
ctx.hooks.on('sac:chain_updated', async ({ sessionId, chain }) => {
  const gainPlugin = chain.plugins.find(p => p.name === 'Gain')
  if (gainPlugin) {
    await ctx.db.set('last-gain', gainPlugin.parameters[0].value)
  }
})
```

### Sending commands programmatically

Inject `SacSessionService` and call its methods directly:

```typescript
import { SacSessionService } from '@/services/sac/SacSessionService'

// Set gain to 50% on the first plugin
sacService.sendSetParameter(sessionId, 0, 0, 0.5)
```

### Frontend: consuming chain state in a custom component

The chain state is available on the WebSocket subscription. Subscribe to the `sac:chain_state` frontend event:

```typescript
ctx.events.on('sac:chain_state', ({ plugins }) => {
  console.log('Chain has', plugins.length, 'plugins')
})
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| SAC not detected | Ensure SAC is running and on the same machine or LAN; check firewall allows UDP 54920–54922 |
| "Session expired" immediately | Confirm clocks are in sync; heartbeat timeout is 30 s |
| Parameters not updating | The 40 ms debounce is normal; rapid-fire sliders may feel slightly delayed |
| Chain resets on SAC restart | SAC persists chain state via ValueTree; if it's blank, check SAC's data directory |
| `PLUGIN_LIST` empty | Run a VST scan in the SlopAudio Connect settings |

---

## See Also

- [Plugin System Overview](plugin-system-overview.md)
- [Plugin API Reference](plugin-api-reference.md)
