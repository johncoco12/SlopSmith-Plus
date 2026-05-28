import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { usePlayerStore } from '@/features/player/store'
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

export type SacStatus = 'idle' | 'linking' | 'linked' | 'monitoring'

export const useSacStore = defineStore('sac', () => {
  const status          = ref<SacStatus>('idle')
  const linkedSessionId = ref<string | null>(null)
  const profileName     = ref<string | null>(null)
  const lastPitch       = ref<SacPitch | null>(null)
  const error           = ref<string | null>(null)
  const availableSessions = ref<SacSessionInfo[]>([])
  const loadingSessions = ref(false)

  let ws: WebSocket | null = null

  // ── WebSocket ─────────────────────────────────────────────────────────────

  function openWs(): WebSocket {
    if (ws && ws.readyState < WebSocket.CLOSING) return ws

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/sac`)

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
        break

      case 'sac:disconnected':
        status.value          = 'idle'
        linkedSessionId.value = null
        profileName.value     = null
        lastPitch.value       = null
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
      const res = await fetch('/api/sac/sessions')
      availableSessions.value = await res.json() as SacSessionInfo[]
    } catch {
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
    if (linkedSessionId.value) {
      ws?.send(JSON.stringify({ type: 'track:stop', sessionId: linkedSessionId.value }))
    }
    ws?.close()
    ws = null
    status.value          = 'idle'
    linkedSessionId.value = null
    profileName.value     = null
    lastPitch.value       = null
    error.value           = null
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
    fetchSessions,
    linkSession,
    unlink,
  }
})
