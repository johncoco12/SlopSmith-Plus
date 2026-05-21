<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useShortcuts } from '@/composables/useShortcuts'
import HighwayCanvas from '@/components/player/HighwayCanvas.vue'
import PlayerHud from '@/components/player/PlayerHud.vue'
import PlayerControls from '@/components/player/PlayerControls.vue'

const route  = useRoute()
const router = useRouter()
const player = usePlayerStore()

const filename    = computed(() => route.params.filename)
const arrangement = computed(() => Number(route.query.arrangement ?? 0))

// Time sync loop — updates player.currentTime each frame
let _rafId: number | null = null
function _syncLoop() {
  player.syncTime()
  _rafId = requestAnimationFrame(_syncLoop)
}

onMounted(() => {
  _rafId = requestAnimationFrame(_syncLoop)
})

onUnmounted(() => {
  if (_rafId !== null) cancelAnimationFrame(_rafId)
})

// Load song whenever filename/arrangement changes
watch(
  [filename, arrangement],
  async ([fn, arr]) => {
    if (fn) await player.playSong(fn, arr)
  },
  { immediate: true }
)

// Keyboard shortcuts
const { register } = useShortcuts('player')
register(' ',          () => player.togglePlay())
register('ArrowLeft',  e  => { e.preventDefault(); player.seekBy(e.shiftKey ? -30 : -5) })
register('ArrowRight', e  => { e.preventDefault(); player.seekBy(e.shiftKey ?  30 :  5) })
register('[',          e  => player.nudgeAvOffset(e.shiftKey ? -50 : -10))
register(']',          e  => player.nudgeAvOffset(e.shiftKey ?  50 :  10))
register('0',          () => player.setAvOffset(0))
register('\\',         () => player.toggleLyrics())
register('Escape',     () => router.back())

function handleBack() {
  router.back()
}
</script>

<template>
  <!-- highway.js writes to these elements in its song_info / song:ready handlers.
       All must exist before any WebSocket message arrives or the handler throws
       before it reaches audio.src, preventing audio from loading at all. -->
  <audio id="audio" preload="auto" class="hidden" />
  <span   id="hud-artist"      class="hidden" aria-hidden="true" />
  <span   id="hud-title"       class="hidden" aria-hidden="true" />
  <span   id="hud-arrangement" class="hidden" aria-hidden="true" />
  <select id="arr-select"      class="hidden" aria-hidden="true" />

  <div class="fixed inset-0 bg-dark-800 flex flex-col z-50 overflow-hidden">
    <!-- Highway + HUD wrapper — flex-col so canvas's flex-1 works -->
    <div class="relative flex-1 min-h-0 flex flex-col">
      <HighwayCanvas />
      <PlayerHud />
      <!-- Bottom gradient bleed into controls -->
      <div
        class="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-dark-800/75 to-transparent pointer-events-none z-10"
      />
    </div>

    <!-- Controls bar -->
    <PlayerControls @back="handleBack" />
  </div>
</template>
