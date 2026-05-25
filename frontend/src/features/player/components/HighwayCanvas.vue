<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { usePlayer } from '@/features/player'
import { RendererManager } from '@/features/player'

const canvasRef = ref<HTMLCanvasElement | null>(null)

// Renderer-agnostic player produces the bundle
const { bundle } = usePlayer()

// RendererManager handles canvas rendering, error recovery, visibility
const emit = (event: string, detail?: unknown) => {
  ;(window as any).slopsmith?.emit?.(event, detail)
}
const rendererMgr = new RendererManager(emit)

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  rendererMgr.setCanvas(canvas)
  rendererMgr.setRenderer(null) // uses DefaultRenderer (2D)
  rendererMgr.resize(canvas.parentElement, window.devicePixelRatio)

  // Drive the draw loop from the reactive bundle
  rendererMgr.startLoop(() => bundle.value ?? undefined)

  // Resize on window change
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  rendererMgr.stopLoop()
  window.removeEventListener('resize', onResize)
})

function onResize() {
  const canvas = canvasRef.value
  if (!canvas) return
  rendererMgr.resize(canvas.parentElement, window.devicePixelRatio)
}
</script>

<template>
  <canvas
    ref="canvasRef"
    id="highway"
    class="flex-1 block w-full min-h-0"
    aria-label="Note highway"
  />
</template>
