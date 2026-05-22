import { onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '@/stores/player'

/**
 * Binds the global window.highway singleton to the player store once the
 * #highway canvas is in the DOM, then wires up reactive song-info updates.
 *
 * highway.js creates one instance at load time and exports it as
 * window.highway.  We call window.highway.init(canvas) to attach the canvas,
 * register the instance with the store, and replay playSong() in case the
 * route watch already fired before the highway was ready.
 */
export function useHighway(): void {
  const player = usePlayerStore()

  function onSongReady() {
    player.setSongInfo(window.highway.getSongInfo())
  }

  onMounted(() => {
    if (!window.highway) {
      console.error('[useHighway] window.highway not found — highway.js not loaded')
      return
    }
    const canvas = document.getElementById('highway') as HTMLCanvasElement | null
    if (!canvas) {
      console.error('[useHighway] #highway canvas not found in DOM')
      return
    }

    window.highway.init(canvas)
    player.setHighway(window.highway)

    // Update songInfo whenever a track finishes loading (covers arrangement switches too)
    window.slopsmith?.on('song:ready', onSongReady)

    // Re-trigger if a trackId is queued from the route
    if (player.trackIdRef) {
      player.playSong(player.trackIdRef, player.arrangement, player.trackIdRef)
    }
  })

  onUnmounted(() => {
    window.slopsmith?.off('song:ready', onSongReady)
    player.cleanup()
  })
}
