import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { fetchLoops, saveLoop as apiSaveLoop, deleteLoop as apiDeleteLoop } from '@/api/loops'
import type { SongInfo, Loop } from '@/types'

export const usePlayerStore = defineStore('player', () => {
  // DOM-coupled — not reactive-proxied
  const highway = shallowRef<typeof window.highway | null>(null)

  // Song state
  const filename    = ref<string | null>(null)
  const arrangement = ref<number>(0)
  const songInfo    = ref<SongInfo>({})
  const arrangements = ref<unknown[]>([])
  const duration    = ref<number>(0)

  // Playback state
  const playing     = ref<boolean>(false)
  const currentTime = ref<number>(0)

  // Persisted settings
  const avOffsetMs    = useLocalStorage('avOffset', 0)
  const mastery       = useLocalStorage('masterDifficulty', 100)
  const vizSelection  = useLocalStorage('vizSelection', 'auto')
  const showLyrics    = useLocalStorage('showLyrics', true)
  const masterVolume  = useLocalStorage('volume', 100)

  // Session
  const speed = ref<number>(1.0)
  const loopA = ref<number | null>(null)
  const loopB = ref<number | null>(null)
  const savedLoops = ref<Loop[]>([])

  // Pitch detection (synced with window.pitchYin via syncTime rAF)
  const pitchDetectionEnabled = ref<boolean>(false)

  // Seek-in-progress guard: browser may briefly report audio.currentTime = 0
  // during a seek. Hold the target time until the 'seeked' event confirms.
  let _seekTarget: number | null = null

  // ── highway lifecycle ─────────────────────────────────────────────────────

  function setHighway(hw: typeof window.highway): void {
    highway.value = hw
  }

  function setSongInfo(info: SongInfo | null): void {
    songInfo.value = info ?? {}
    // Re-evaluate auto-viz now that we have real song data (called on song:ready)
    if (vizSelection.value === 'auto' && highway.value) _applyViz()
  }

  async function playSong(fn: string, arrIdx = 0): Promise<void> {
    filename.value = fn
    arrangement.value = arrIdx
    playing.value = false
    currentTime.value = 0
    loopA.value = null
    loopB.value = null

    if (highway.value) {
      await highway.value.reconnect(fn, arrIdx)
      highway.value.setAvOffset?.(avOffsetMs.value)
      highway.value.setMasterDifficulty?.(mastery.value / 100)
      if (!showLyrics.value) highway.value.toggleLyrics?.()
      _applyViz()
    }

    try {
      savedLoops.value = await fetchLoops(fn) as Loop[]
    } catch {
      savedLoops.value = []
    }
  }

  async function changeArrangement(idx: number): Promise<void> {
    arrangement.value = idx
    if (highway.value) {
      await highway.value.reconnect(filename.value!, idx)
    }
  }

  function cleanup(): void {
    highway.value?.stop()
    highway.value = null
    playing.value = false
    filename.value = null
  }

  // ── playback controls ─────────────────────────────────────────────────────

  function togglePlay(): void {
    const audio = highway.value?.getAudioElement()
    if (!audio) return
    if (audio.paused) { audio.play(); playing.value = true }
    else              { audio.pause(); playing.value = false }
  }

  function seekBy(seconds: number): void {
    const audio = highway.value?.getAudioElement()
    if (!audio) return
    _seekTarget = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds))
    audio.currentTime = _seekTarget
  }

  function seekTo(time: number): void {
    const audio = highway.value?.getAudioElement()
    if (!audio || !isFinite(time) || !duration.value) return
    const clamped = Math.max(0, Math.min(duration.value, time))
    _seekTarget = clamped
    audio.currentTime = clamped
  }

  function setSpeed(v: number): void {
    speed.value = v
    const audio = highway.value?.getAudioElement()
    if (audio) audio.playbackRate = v
  }

  function setMastery(v: number): void {
    mastery.value = v
    highway.value?.setMasterDifficulty?.(v / 100)
  }

  function setAvOffset(ms: number): void {
    avOffsetMs.value = ms
    highway.value?.setAvOffset?.(ms)
  }

  function nudgeAvOffset(delta: number): void {
    setAvOffset(Math.max(-1000, Math.min(1000, avOffsetMs.value + delta)))
  }

  function setVolume(v: number): void {
    masterVolume.value = v
    const audio = highway.value?.getAudioElement()
    if (audio) audio.volume = v / 100
  }

  // ── lyrics ────────────────────────────────────────────────────────────────

  function toggleLyrics(): void {
    showLyrics.value = !showLyrics.value
    highway.value?.toggleLyrics?.()
  }

  // ── pitch detection ───────────────────────────────────────────────────────

  function togglePitchDetection(): void {
    if (window.pitchYin?.isRunning()) {
      window.pitchYin.stop()
      pitchDetectionEnabled.value = false
    } else if (window.pitchYin) {
      window.pitchYin.start().then(() => {
        pitchDetectionEnabled.value = true
      }).catch(e => {
        console.error('[player] pitch detection start failed:', e)
      })
    }
  }

  // ── visualization ─────────────────────────────────────────────────────────

  function setViz(id: string): void {
    vizSelection.value = id
    _applyViz()
  }

  function _applyViz(): void {
    if (!highway.value) return

    if (vizSelection.value === 'default') {
      highway.value.setRenderer?.(null)
      return
    }

    if (vizSelection.value === 'auto') {
      // Evaluate each registered factory's matchesArrangement predicate
      const info = songInfo.value
      const match = Object.keys(window)
        .filter(k => k.startsWith('slopsmithViz_'))
        .map(k => window[k] as any)
        .find(f =>
          typeof f?.matchesArrangement === 'function' &&
          !(f.contextType === 'webgl2' && !_canRun3D()) &&
          f.matchesArrangement(info)
        )
      highway.value.setRenderer?.(match ? match() : null)
      return
    }

    const factory = window[`slopsmithViz_${vizSelection.value}`] as any
    if (!factory) return  // plugin not loaded yet — plugins:ready will re-apply
    if (factory.contextType === 'webgl2' && !_canRun3D()) {
      highway.value.setRenderer?.(null)
      return
    }
    highway.value.setRenderer?.(factory())
  }

  // One-shot WebGL2 probe, cached after first call
  let _webgl2: boolean | null = null
  function _canRun3D(): boolean {
    if (_webgl2 !== null) return _webgl2
    try {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2')
      _webgl2 = !!gl
      if (gl) (gl.getExtension?.('WEBGL_lose_context') as any)?.loseContext?.()
    } catch { _webgl2 = false }
    return _webgl2!
  }

  // Re-apply viz once plugin scripts finish loading (window.slopsmithViz_* now exist)
  window.slopsmith?.on('plugins:ready', () => {
    if (highway.value) _applyViz()
  })

  // When highway.js reverts a failed renderer, sync vizSelection back to default
  window.slopsmith?.on('viz:reverted', (e) => {
    vizSelection.value = 'default'
    console.warn('[player] viz reverted to default:', (e as CustomEvent).detail?.reason)
  })

  // ── loops ─────────────────────────────────────────────────────────────────

  function setLoopA(): void {
    loopA.value = highway.value?.getTime?.() ?? currentTime.value
  }

  function setLoopB(): void {
    loopB.value = highway.value?.getTime?.() ?? currentTime.value
    if (loopA.value !== null) _activateLoop()
  }

  function _activateLoop(): void {
    const a = Math.min(loopA.value!, loopB.value!)
    const b = Math.max(loopA.value!, loopB.value!)
    highway.value?.setLoop?.(a, b)
  }

  function clearLoop(): void {
    loopA.value = null
    loopB.value = null
    highway.value?.setLoop?.(null, null)
  }

  async function saveLoop(): Promise<void> {
    if (loopA.value === null || loopB.value === null) return
    const loop = await apiSaveLoop({
      filename: filename.value,
      name: `Loop ${new Date().toLocaleTimeString()}`,
      start: Math.min(loopA.value, loopB.value),
      end:   Math.max(loopA.value, loopB.value),
    }) as Loop
    savedLoops.value.push(loop)
  }

  function loadLoop(loop: Loop): void {
    loopA.value = loop.start
    loopB.value = loop.end
    highway.value?.setLoop?.(loop.start, loop.end)
  }

  async function deleteLoop(loopId: number): Promise<void> {
    await apiDeleteLoop(loopId)
    savedLoops.value = savedLoops.value.filter(l => l.id !== loopId)
  }

  // ── time sync (called from PlayerView's rAF) ──────────────────────────────

  function syncTime(): void {
    if (!highway.value) return
    const audio = highway.value.getAudioElement?.()
    if (audio) {
      // While a seek is in-flight the browser may briefly report
      // audio.currentTime = 0 (Chromium artifact).  Use the intended
      // seek target until the audio element confirms by reaching it.
      const t = (_seekTarget !== null && Math.abs(audio.currentTime - _seekTarget) > 0.5)
        ? _seekTarget
        : audio.currentTime
      if (_seekTarget !== null && Math.abs(audio.currentTime - _seekTarget) < 0.5) {
        _seekTarget = null
      }
      if (audio.readyState === 0) {
        console.warn('[syncTime] audio src was reset', { readyState: audio.readyState, src: audio.src, currentTime: audio.currentTime })
      }
      highway.value.setTime?.(t)
      duration.value = audio.duration || 0
    }
    currentTime.value = highway.value.getTime?.() ?? 0
    pitchDetectionEnabled.value = window.pitchYin?.isRunning() ?? false
  }

  return {
    highway, filename, arrangement, songInfo, arrangements, duration,
    playing, currentTime,
    avOffsetMs, mastery, vizSelection, showLyrics, masterVolume,
    speed, loopA, loopB, savedLoops,
    pitchDetectionEnabled,
    setHighway, setSongInfo, playSong, changeArrangement, cleanup,
    togglePlay, seekBy, seekTo, setSpeed, setMastery, setAvOffset, nudgeAvOffset, setVolume,
    toggleLyrics, setViz,
    togglePitchDetection,
    setLoopA, setLoopB, clearLoop, saveLoop, loadLoop, deleteLoop,
    syncTime,
  }
})
