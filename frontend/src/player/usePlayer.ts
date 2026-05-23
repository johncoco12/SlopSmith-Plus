// usePlayer — renderer-agnostic player composable
//
// Sets up the SongDataProvider (data loading, timing, mastery),
// drives a frame loop to produce RenderBundle each frame,
// and exposes a reactive bundle ref for any renderer to consume.
//
// This replaces the old useHighway() which coupled data loading to a canvas.

import { onMounted, onUnmounted, shallowRef, type ShallowRef } from 'vue'
import { SongDataProvider } from './SongDataProvider'
import { HitDetector } from './hitDetection'
import { usePlayerStore } from '@/stores/player'
import type { RenderBundle } from './types'

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
  const provider = new SongDataProvider()
  const bundle = provider.bundle

  let hitDetector: HitDetector | null = null
  let rafId: number | null = null

  function onSongReady(): void {
    store.setSongInfo(provider.getSongInfo() as any ?? null)
  }

  function frameLoop(): void {
    rafId = requestAnimationFrame(frameLoop)

    // Sync timing from audio element
    const audio = document.getElementById('audio') as HTMLAudioElement | null
    if (audio && audio.readyState > 0) {
      provider.setTime(audio.currentTime)
      store.duration = audio.duration || 0
    }
    store.currentTime = provider.getTime()

    // Produce bundle
    provider.makeBundle()
  }

  onMounted(() => {
    // Wire to player store (backwards compat — store still expects a highway-like object)
    ;(window as any).highway = provider
    store.setHighway(provider as any)

    // Hit detection
    hitDetector = new HitDetector(provider as any)
    hitDetector.setup()

    // Ready callback
    provider.onReady = onSongReady
    const emitter = (window as any).slopsmith
    emitter?.on?.('song:ready', onSongReady)

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

    const emitter = (window as any).slopsmith
    emitter?.off?.('song:ready', onSongReady)

    hitDetector?.teardown()
    hitDetector = null

    provider.stop()
    store.cleanup()
  })

  return { bundle, provider }
}
