import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { usePlayerStore } from '@/features/player/store'
import { useAuthStore } from '@/features/auth/store'
import { isRunning as isPitchRunning, stop as pitchStop, start as pitchStart } from '@/features/player/services/pitchDetection'

export interface SacSessionInfo {
  sessionId:   string
  profileId:   number
  profileName: string
  sacIp:       string
  lastSeen:    number
  linked:      boolean
}

export interface SacPitch {
  frequency:  number
  confidence: number
  midiNote:   number
  noteName:   string
}

export interface SacPluginParameter {
  index:        number
  name:         string
  label:        string
  value:        number
  defaultValue: number
  steps:        number
}

export interface SacPluginEntry {
  index:      number
  name:       string
  vendor:     string
  pluginId:   string
  bypassed:   boolean
  parameters: SacPluginParameter[]
}

export interface SacPluginListEntry {
  pluginId: string
  name:     string
  vendor:   string
}

export type SacStatus = 'idle' | 'linking' | 'linked' | 'monitoring'

export const useSacStore = defineStore('sac', () => {
  const status          = ref<SacStatus>('idle')
  const linkedSessionId = ref<string | null>(null)
  const profileName     = ref<string | null>(null)
  const lastPitch       = ref<SacPitch | null>(null)
  const error           = ref<string | null>(null)
  const availableSessions = ref<SacSessionInfo[]>([])
  const loadingSessions = ref(false)
  const chainState      = ref<SacPluginEntry[]>([])
  const pluginList      = ref<SacPluginListEntry[]>([])

  const auth = useAuthStore()
  let ws: WebSocket | null = null

  // ── WebSocket ─────────────────────────────────────────────────────────────

  function openWs(): WebSocket {
    if (ws && ws.readyState < WebSocket.CLOSING) return ws

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = auth.token ? `?token=${encodeURIComponent(auth.token)}` : ''
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/sac${token}`)

    ws.onmessage = (ev: MessageEvent) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(ev.data as string) }
      catch { return }
      handleMessage(msg)
    }

    ws.onclose = () => {
      status.value          = 'idle'
      linkedSessionId.value = null
      profileName.value     = null
      lastPitch.value       = null
      chainState.value      = []
      pluginList.value      = []
    }

    ws.onerror = () => {
      error.value = 'WebSocket connection failed'
    }

    return ws
  }

  function handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'sac:connected':
        status.value      = 'linked'
        profileName.value = String(msg.profileName ?? '')
        error.value       = null
        // Ask SAC for current chain state now that the WS link is live
        sendWs({ type: 'sac:request_chain_state' })
        break

      case 'sac:disconnected':
        status.value          = 'idle'
        linkedSessionId.value = null
        profileName.value     = null
        lastPitch.value       = null
        chainState.value      = []
        pluginList.value      = []
        break

      case 'sac:monitoring_active':
        status.value = 'monitoring'
        break

      case 'sac:monitoring_stopped':
        status.value    = 'linked'
        lastPitch.value = null
        break

      case 'sac:pitch':
        lastPitch.value = {
          frequency:  Number(msg.frequency),
          confidence: Number(msg.confidence),
          midiNote:   Number(msg.midiNote),
          noteName:   String(msg.noteName ?? ''),
        }
        // Forward to the hit-detection engine — same event the WASM YIN service emits
        ;(window as any).slopsmith?.emit?.('pitch:detected', {
          hz:      lastPitch.value.frequency,
          clarity: lastPitch.value.confidence,
        })
        break

      case 'sac:chain_state':
        chainState.value = (msg.plugins ?? []) as SacPluginEntry[]
        break

      case 'sac:plugin_list':
        pluginList.value = (msg.plugins ?? []) as SacPluginListEntry[]
        break

      case 'sac:error':
        error.value     = String(msg.reason ?? 'unknown error')
        status.value    = 'idle'
        break
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function fetchSessions(): Promise<void> {
    loadingSessions.value = true
    try {
      const headers: Record<string, string> = {}
      if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`
      const res = await fetch('/api/sac/sessions', { headers })
      if (res.status === 401 || res.status === 403) {
        error.value = 'Not authenticated — please log in'
        availableSessions.value = []
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      error.value = null
      const body: unknown = await res.json()
      availableSessions.value = Array.isArray(body) ? (body as SacSessionInfo[]) : []
    } catch (e) {
      error.value = 'Could not load sessions'
      availableSessions.value = []
    } finally {
      loadingSessions.value = false
    }
  }

  function linkSession(sessionId: string): void {
    status.value = 'linking'
    error.value  = null
    linkedSessionId.value = sessionId

    const socket = openWs()
    const doLink = () => {
      socket.send(JSON.stringify({ type: 'track:link_sac', sessionId }))
    }

    if (socket.readyState === WebSocket.OPEN) {
      doLink()
    } else {
      socket.addEventListener('open', doLink, { once: true })
    }
  }

  function unlink(): void {
    if (linkedSessionId.value && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'track:stop', sessionId: linkedSessionId.value }))
    }
    ws?.close()
    ws = null
    status.value          = 'idle'
    linkedSessionId.value = null
    profileName.value     = null
    lastPitch.value       = null
    chainState.value      = []
    pluginList.value      = []
    error.value           = null
  }

  // ── Plugin control actions ────────────────────────────────────────────────

  function sendWs(msg: object): void {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  function setParameter(pluginIndex: number, parameterIndex: number, value: number): void {
    sendWs({ type: 'sac:set_parameter', pluginIndex, parameterIndex, value })
    // Optimistically update local state
    const plugin = chainState.value[pluginIndex]
    if (plugin) {
      const param = plugin.parameters[parameterIndex]
      if (param) param.value = value
    }
  }

  function setBypass(pluginIndex: number, bypassed: boolean): void {
    sendWs({ type: 'sac:set_bypass', pluginIndex, bypassed })
    const plugin = chainState.value[pluginIndex]
    if (plugin) plugin.bypassed = bypassed
  }

  function movePlugin(fromIndex: number, toIndex: number): void {
    sendWs({ type: 'sac:move_plugin', fromIndex, toIndex })
  }

  function removePlugin(pluginIndex: number): void {
    sendWs({ type: 'sac:remove_plugin', pluginIndex })
  }

  function addPlugin(pluginId: string): void {
    sendWs({ type: 'sac:add_plugin', pluginId })
  }

  function requestChainState(): void {
    sendWs({ type: 'sac:request_chain_state' })
  }

  // ── Auto-trigger monitoring on track play/stop ────────────────────────────

  const player = usePlayerStore()

  // When SAC starts monitoring it becomes the pitch source — pause the browser's
  // built-in mic detector to avoid double-detection. Restore it when SAC stops.
  let _pitchWasRunning = false
  watch(status, (next, prev) => {
    if (next === 'monitoring') {
      _pitchWasRunning = isPitchRunning()
      if (_pitchWasRunning) {
        pitchStop()
        player.pitchDetectionEnabled = false
      }
    } else if (prev === 'monitoring') {
      if (_pitchWasRunning) {
        pitchStart().then(() => { player.pitchDetectionEnabled = true }).catch(() => {})
        _pitchWasRunning = false
      }
    }
  })

  watch(() => player.playing, (isPlaying) => {
    if (!linkedSessionId.value || !ws || ws.readyState !== WebSocket.OPEN) return

    if (isPlaying) {
      ws.send(JSON.stringify({
        type:        'track:play',
        sessionId:   linkedSessionId.value,
        trackId:     player.trackIdRef ?? '',
        tuning:      (player.songInfo as Record<string, unknown>)?.tuning ?? '',
        arrangement: String(player.arrangement ?? 0),
      }))
    } else if (status.value === 'monitoring') {
      ws.send(JSON.stringify({ type: 'track:stop', sessionId: linkedSessionId.value }))
    }
  })

  return {
    status,
    linkedSessionId,
    profileName,
    lastPitch,
    error,
    availableSessions,
    loadingSessions,
    chainState,
    pluginList,
    fetchSessions,
    linkSession,
    unlink,
    setParameter,
    setBypass,
    movePlugin,
    removePlugin,
    addPlugin,
    requestChainState,
  }
})
