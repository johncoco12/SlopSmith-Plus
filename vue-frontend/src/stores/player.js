import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { fetchLoops, saveLoop as apiSaveLoop, deleteLoop as apiDeleteLoop } from '@/api/loops'

export const usePlayerStore = defineStore('player', () => {
  // DOM-coupled — not reactive-proxied
  const highway = shallowRef(null)

  // Song state
  const filename    = ref(null)
  const arrangement = ref(0)
  const songInfo    = ref({})
  const arrangements = ref([])
  const duration    = ref(0)

  // Playback state
  const playing     = ref(false)
  const currentTime = ref(0)

  // Persisted settings
  const avOffsetMs    = useLocalStorage('avOffset', 0)
  const mastery       = useLocalStorage('masterDifficulty', 100)
  const vizSelection  = useLocalStorage('vizSelection', 'auto')
  const showLyrics    = useLocalStorage('showLyrics', true)
  const masterVolume  = useLocalStorage('volume', 100)

  // Session
  const speed = ref(1.0)
  const loopA = ref(null)
  const loopB = ref(null)
  const savedLoops = ref([])

  // ── highway lifecycle ─────────────────────────────────────────────────────

  function setHighway(hw) {
    highway.value = hw
  }

  function setSongInfo(info) {
    songInfo.value = info ?? {}
    // Re-evaluate auto-viz now that we have real song data (called on song:ready)
    if (vizSelection.value === 'auto' && highway.value) _applyViz()
  }

  async function playSong(fn, arrIdx = 0) {
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
      savedLoops.value = await fetchLoops(fn)
    } catch {
      savedLoops.value = []
    }
  }

  async function changeArrangement(idx) {
    arrangement.value = idx
    if (highway.value) {
      await highway.value.reconnect(filename.value, idx)
    }
  }

  function cleanup() {
    highway.value?.stop()
    highway.value = null
    playing.value = false
    filename.value = null
  }

  // ── playback controls ─────────────────────────────────────────────────────

  function togglePlay() {
    const audio = highway.value?.getAudioElement()
    if (!audio) return
    if (audio.paused) { audio.play(); playing.value = true }
    else              { audio.pause(); playing.value = false }
  }

  function seekBy(seconds) {
    const audio = highway.value?.getAudioElement()
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds))
  }

  function seekTo(time) {
    const audio = highway.value?.getAudioElement()
    if (!audio || !isFinite(time)) return
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, time))
  }

  function setSpeed(v) {
    speed.value = v
    const audio = highway.value?.getAudioElement()
    if (audio) audio.playbackRate = v
  }

  function setMastery(v) {
    mastery.value = v
    highway.value?.setMasterDifficulty?.(v / 100)
  }

  function setAvOffset(ms) {
    avOffsetMs.value = ms
    highway.value?.setAvOffset?.(ms)
  }

  function nudgeAvOffset(delta) {
    setAvOffset(Math.max(-1000, Math.min(1000, avOffsetMs.value + delta)))
  }

  function setVolume(v) {
    masterVolume.value = v
    const audio = highway.value?.getAudioElement()
    if (audio) audio.volume = v / 100
  }

  // ── lyrics ────────────────────────────────────────────────────────────────

  function toggleLyrics() {
    showLyrics.value = !showLyrics.value
    highway.value?.toggleLyrics?.()
  }

  // ── visualization ─────────────────────────────────────────────────────────

  function setViz(id) {
    vizSelection.value = id
    _applyViz()
  }

  function _applyViz() {
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
        .map(k => window[k])
        .find(f =>
          typeof f?.matchesArrangement === 'function' &&
          !(f.contextType === 'webgl2' && !_canRun3D()) &&
          f.matchesArrangement(info)
        )
      highway.value.setRenderer?.(match ? match() : null)
      return
    }

    const factory = window[`slopsmithViz_${vizSelection.value}`]
    if (!factory) return  // plugin not loaded yet — plugins:ready will re-apply
    if (factory.contextType === 'webgl2' && !_canRun3D()) {
      highway.value.setRenderer?.(null)
      return
    }
    highway.value.setRenderer?.(factory())
  }

  // One-shot WebGL2 probe, cached after first call
  let _webgl2 = null
  function _canRun3D() {
    if (_webgl2 !== null) return _webgl2
    try {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2')
      _webgl2 = !!gl
      if (gl) gl.getExtension?.('WEBGL_lose_context')?.loseContext?.()
    } catch { _webgl2 = false }
    return _webgl2
  }

  // Re-apply viz once plugin scripts finish loading (window.slopsmithViz_* now exist)
  window.slopsmith?.on('plugins:ready', () => {
    if (highway.value) _applyViz()
  })

  // When highway.js reverts a failed renderer, sync vizSelection back to default
  window.slopsmith?.on('viz:reverted', (e) => {
    vizSelection.value = 'default'
    console.warn('[player] viz reverted to default:', e.detail?.reason)
  })

  // ── loops ─────────────────────────────────────────────────────────────────

  function setLoopA() {
    loopA.value = highway.value?.getTime() ?? currentTime.value
  }

  function setLoopB() {
    loopB.value = highway.value?.getTime() ?? currentTime.value
    if (loopA.value !== null) _activateLoop()
  }

  function _activateLoop() {
    const a = Math.min(loopA.value, loopB.value)
    const b = Math.max(loopA.value, loopB.value)
    highway.value?.setLoop?.(a, b)
  }

  function clearLoop() {
    loopA.value = null
    loopB.value = null
    highway.value?.setLoop?.(null, null)
  }

  async function saveLoop() {
    if (loopA.value === null || loopB.value === null) return
    const loop = await apiSaveLoop({
      filename: filename.value,
      name: `Loop ${new Date().toLocaleTimeString()}`,
      start: Math.min(loopA.value, loopB.value),
      end:   Math.max(loopA.value, loopB.value),
    })
    savedLoops.value.push(loop)
  }

  function loadLoop(loop) {
    loopA.value = loop.start
    loopB.value = loop.end
    highway.value?.setLoop?.(loop.start, loop.end)
  }

  async function deleteLoop(loopId) {
    await apiDeleteLoop(loopId)
    savedLoops.value = savedLoops.value.filter(l => l.id !== loopId)
  }

  // ── time sync (called from PlayerView's rAF) ──────────────────────────────

  function syncTime() {
    if (!highway.value) return
    const audio = highway.value.getAudioElement?.()
    if (audio) {
      // Drive the highway render position — equivalent to the 60fps setInterval
      // in app.js that the vanilla frontend runs.  Without this the note highway
      // never scrolls and the seek bar stays at 0.
      highway.value.setTime?.(audio.currentTime)
      duration.value = audio.duration || 0
    }
    currentTime.value = highway.value.getTime?.() ?? 0
  }

  return {
    highway, filename, arrangement, songInfo, arrangements, duration,
    playing, currentTime,
    avOffsetMs, mastery, vizSelection, showLyrics, masterVolume,
    speed, loopA, loopB, savedLoops,
    setHighway, setSongInfo, playSong, changeArrangement, cleanup,
    togglePlay, seekBy, seekTo, setSpeed, setMastery, setAvOffset, nudgeAvOffset, setVolume,
    toggleLyrics, setViz,
    setLoopA, setLoopB, clearLoop, saveLoop, loadLoop, deleteLoop,
    syncTime,
  }
})
