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
export function useHighway() {
  const player = usePlayerStore()

  function onSongReady() {
    player.setSongInfo(window.highway.getSongInfo())
  }

  onMounted(() => {
    if (!window.highway) {
      console.error('[useHighway] window.highway not found — highway.js not loaded')
      return
    }
    const canvas = document.getElementById('highway')
    if (!canvas) {
      console.error('[useHighway] #highway canvas not found in DOM')
      return
    }

    window.highway.init(canvas)
    player.setHighway(window.highway)

    // Update songInfo whenever a track finishes loading (covers arrangement switches too)
    window.slopsmith?.on('song:ready', onSongReady)

    // The route watch (immediate:true) already ran before this mount, so
    // playSong() ran with highway.value === null and skipped the WebSocket
    // connect.  Re-trigger only if a filename is queued — the watch already
    // called playSong() but the reconnect was skipped.  Use player.filename
    // (set by playSong) as the sentinel; if it's null nothing was queued.
    // Pass player.arrangement which playSong() already wrote from the route.
    if (player.filename) {
      player.playSong(player.filename, player.arrangement)
    }
  })

  onUnmounted(() => {
    window.slopsmith?.off('song:ready', onSongReady)
    player.cleanup()
  })
}
