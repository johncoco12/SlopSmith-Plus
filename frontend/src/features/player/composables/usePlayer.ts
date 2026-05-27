// usePlayer — renderer-agnostic player composable
//
// Sets up the SongDataProvider (data loading, timing, mastery),
// drives a frame loop to produce RenderBundle each frame,
// and exposes a reactive bundle ref for any renderer to consume.
//
// This replaces the old useHighway() which coupled data loading to a canvas.

import { onMounted, onUnmounted, shallowRef, type ShallowRef } from 'vue'
import { SongDataProvider } from '../engine/SongDataProvider'
import { HitDetector } from '../engine/hitDetection'
import { SectionScorer } from '../engine/sectionScorer'
import { usePlayerStore } from '@/features/player/store'
import { useAuthStore } from '@/features/auth/store'
import { submitScore } from '@/features/player/scoreApi'
import type { RenderBundle } from '../types'

export interface UsePlayerReturn {
  /** Reactive RenderBundle — updated every frame when song is loaded */
  bundle: ShallowRef<RenderBundle | null>
  /** The data provider instance (for direct API access if needed) */
  provider: SongDataProvider
}

/**
 * Renderer-agnostic player setup.
 *
 * - Creates a SongDataProvider for chart data loading & timing
 * - Runs a rAF loop to produce RenderBundle each frame
 * - Wires to the player store for audio sync
 * - Sets up hit detection
 *
 * The returned `bundle` ref can be consumed by any renderer (2D canvas, 3D TresJS, etc.)
 */
export function usePlayer(): UsePlayerReturn {
  const store = usePlayerStore()
  const auth = useAuthStore()
  const provider = new SongDataProvider()
  const bundle = provider.bundle

  let hitDetector: HitDetector | null = null
  let rafId: number | null = null
  const scorer = new SectionScorer()
  let _prevTime = 0
  let _audio: HTMLAudioElement | null = null

  // ── Per-frame perf breakdown (EMA smoothed, written to window.__perfBreakdown) ──
  const _ALPHA = 0.12   // EMA weight — lower = smoother but slower to react
  const _perf  = { scorer: 0, store: 0, bundle: 0, total: 0 }
  function _ema(prev: number, next: number) { return prev * (1 - _ALPHA) + next * _ALPHA }

  function onSongReady(): void {
    store.setSongInfo(provider.getSongInfo() as any ?? null)

    // Initialise section scorer with chart data from this song.
    // Use audio duration if available; scorer handles Infinity gracefully for the last section.
    const audio = document.getElementById('audio') as HTMLAudioElement | null
    const dur = (audio && isFinite(audio.duration)) ? audio.duration : 0
    scorer.reset()
    scorer.init(
      provider.getSections(),
      provider.getNotes(),
      provider.getChords() as any,
      dur,
    )
    store.sectionResults = [...scorer.getResults()] as any[]
    store.currentSectionIndex = scorer.getCurrentIndex(provider.getTime())
  }

  function frameLoop(): void {
    rafId = requestAnimationFrame(frameLoop)

    // Sync timing from audio element (cached ref — no DOM query per frame)
    const audio = _audio
    if (audio && audio.readyState > 0) {
      provider.setTime(audio.currentTime)
      store.duration = audio.duration || 0
    }
    const newTime = provider.getTime()
    store.currentTime = newTime

    // Detect backward seek — clear section scores for replayed sections
    if (_prevTime - newTime > 0.5) {
      scorer.onSeek(newTime)
    }
    _prevTime = newTime

    const _t0 = performance.now()

    // Update active section, finalise grades, detect misses
    scorer.tick(newTime)

    const _t1 = performance.now()

    // Only allocate a new array (triggering Vue reactivity) when section data changed
    if (scorer.consumeDirty()) {
      store.sectionResults = [...scorer.getResults()] as any[]
    }
    store.currentSectionIndex = scorer.getCurrentIndex(newTime)
    store.combo = scorer.combo
    store.maxCombo = scorer.maxCombo

    const _t2 = performance.now()

    // Produce bundle
    provider.makeBundle()

    const _t3 = performance.now()

    _perf.scorer = _ema(_perf.scorer, _t1 - _t0)
    _perf.store  = _ema(_perf.store,  _t2 - _t1)
    _perf.bundle = _ema(_perf.bundle, _t3 - _t2)
    _perf.total  = _ema(_perf.total,  _t3 - _t0)
    ;(window as any).__perfBreakdown = _perf
  }

  function onSongEnded(): void {
    const results = scorer.getResults()
    if (!scorer.hasSections()) return
    const profileId = auth.profile?.id
    const trackId = store.trackIdRef
    if (!profileId || !trackId) return
    const totalNotes = results.reduce((s, r) => s + r.totalNotes, 0)
    const hitNotes = results.reduce((s, r) => s + r.hitNotes, 0)
    const combined = totalNotes > 0 ? Math.round((hitNotes / totalNotes) * 100) : 100
    submitScore(trackId, combined).catch(e => console.warn('[score] submit failed:', e))
  }

  onMounted(() => {
    // Wire to player store (backwards compat — store still expects a highway-like object)
    ;(window as any).highway = provider
    store.setHighway(provider as any)

    // Hit detection — wire scorer callback for new unique hits
    hitDetector = new HitDetector(provider as any)
    hitDetector.onNoteHit = (key, chartTime) => scorer.recordHit(key, chartTime)
    hitDetector.setup()
    // Expose on window.highway so DebugOverlay can reach it (matches legacy Highway class shape)
    ;(window as any).highway.hitDetector = hitDetector

    // Ready callback
    provider.onReady = onSongReady
    const emitter = (window as any).slopsmith
    emitter?.on?.('song:ready', onSongReady)

    // Cache audio element once — avoids document.getElementById on every rAF frame
    _audio = document.getElementById('audio') as HTMLAudioElement | null
    _audio?.addEventListener('ended', onSongEnded)

    // Start frame loop
    rafId = requestAnimationFrame(frameLoop)

    // Replay song if route watch already fired before mount
    if (store.trackIdRef) {
      store.playSong(store.trackIdRef, store.arrangement, store.trackIdRef)
    }
  })

  onUnmounted(() => {
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    _audio?.removeEventListener('ended', onSongEnded)
    _audio = null

    const emitter = (window as any).slopsmith
    emitter?.off?.('song:ready', onSongReady)

    hitDetector?.teardown()
    hitDetector = null
    if ((window as any).highway) delete (window as any).highway.hitDetector

    scorer.reset()
    store.sectionResults = []
    store.currentSectionIndex = -1
    store.combo = 0
    store.maxCombo = 0

    provider.stop()
    store.cleanup()
  })

  return { bundle, provider }
}
