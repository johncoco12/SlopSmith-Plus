// Vue 3 composable for the Highway.
//
// Creates one Highway instance per component mount, wires it to the player
// store, and cleans up on unmount. Replaces the legacy window.highway global.

import { onMounted, onUnmounted } from 'vue';
import { Highway } from './Highway.js';
import { usePlayerStore } from '@/stores/player.js';

export function useHighway(): void {
  const player = usePlayerStore();
  let hw: Highway | null = null;

  function onSongReady(): void {
    player.setSongInfo(hw?.getSongInfo() ?? null);
  }

  onMounted(() => {
    const canvas = document.getElementById('highway') as HTMLCanvasElement | null;
    if (!canvas) {
      console.error('[useHighway] #highway canvas not found');
      return;
    }

    hw = new Highway();

    // Expose as window.highway so legacy plugin code continues to work.
    (window as unknown as { highway: Highway }).highway = hw;

    hw.init(canvas);
    player.setHighway(hw as unknown as typeof window.highway);

    const emitter = (window as unknown as { slopsmith?: { on?: (e: string, h: (e: Event) => void) => void } }).slopsmith;
    emitter?.on?.('song:ready', onSongReady);

    // Re-play if the route watch already fired before mount.
    if (player.filename) {
      player.playSong(player.filename, player.arrangement);
    }
  });

  onUnmounted(() => {
    const emitter = (window as unknown as { slopsmith?: { off?: (e: string, h: (e: Event) => void) => void } }).slopsmith;
    (emitter as unknown as { off?: (e: string, h: () => void) => void })?.off?.('song:ready', onSongReady);
    player.cleanup();
    hw = null;
  });
}
