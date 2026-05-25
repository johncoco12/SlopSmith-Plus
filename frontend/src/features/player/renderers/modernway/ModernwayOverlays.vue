<script setup lang="ts">
/**
 * ModernwayOverlays — 2D canvas overlay for chord diagram + lyrics.
 * Rendered on top of the WebGL scene as an absolutely-positioned canvas.
 */
import { inject, ref, shallowRef, onMounted, onBeforeUnmount, type ShallowRef } from 'vue';
import type { RenderBundle } from '@/features/player/types';
import { renderBundleKey } from '@/features/player/renderers/keys';
import { useChordDiagram } from './overlays/useChordDiagram';
import { useLyricsOverlay } from './overlays/useLyricsOverlay';

const bundle = inject<ShallowRef<RenderBundle | null>>(renderBundleKey as any)!;
const canvasRef = shallowRef<HTMLCanvasElement | null>(null);

let chordDiagram: ReturnType<typeof useChordDiagram> | null = null;
let lyricsOverlay: ReturnType<typeof useLyricsOverlay> | null = null;

onMounted(() => {
  if (canvasRef.value) {
    chordDiagram = useChordDiagram(canvasRef, bundle);
    lyricsOverlay = useLyricsOverlay(canvasRef, bundle);
    chordDiagram.start();
    lyricsOverlay.start();
  }
});

onBeforeUnmount(() => {
  chordDiagram?.stop();
  lyricsOverlay?.stop();
});
</script>

<template>
  <canvas
    ref="canvasRef"
    class="absolute inset-0 w-full h-full pointer-events-none z-10"
  />
</template>
