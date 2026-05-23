<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useShortcuts } from '@/composables/useShortcuts'
import PlayerCanvas from '@/components/player/PlayerCanvas.vue'
import PlayerHud from '@/components/player/PlayerHud.vue'
import PlayerControls from '@/components/player/PlayerControls.vue'
import DebugOverlay from '@/components/player/DebugOverlay.vue'

const route  = useRoute()
const router = useRouter()
const player = usePlayerStore()

const trackId     = computed(() => route.params.trackId as string)
const arrangement = computed(() => Number(route.query.arrangement ?? 0))

const playerCanvas = ref<InstanceType<typeof PlayerCanvas> | null>(null)

// Start in 3D mode
onMounted(() => {
  playerCanvas.value?.switchRenderer('modernway-3d')
})

// Load song whenever trackId/arrangement changes
watch(
  [trackId, arrangement],
  async ([tid, arr]) => {
    if (tid) await player.playSong(tid, arr, tid)
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
// Toggle renderer with 'v' key
register('v',          () => {
  playerCanvas.value?.cycleRenderer()
})

function handleBack() {
  router.back()
}
</script>

<template>
  <audio id="audio" preload="auto" class="hidden" />
  <span   id="hud-artist"      class="hidden" aria-hidden="true" />
  <span   id="hud-title"       class="hidden" aria-hidden="true" />
  <span   id="hud-arrangement" class="hidden" aria-hidden="true" />
  <select id="arr-select"      class="hidden" aria-hidden="true" />

  <div class="fixed inset-0 bg-dark-800 flex flex-col z-50 overflow-hidden">
    <!-- Canvas + HUD wrapper -->
    <div class="relative flex-1 min-h-0 flex flex-col">
      <PlayerCanvas ref="playerCanvas" />
      <PlayerHud />
      <!-- Bottom gradient bleed -->
      <div
        class="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-dark-800/75 to-transparent pointer-events-none z-10"
      />
    </div>

    <!-- Controls bar -->
    <PlayerControls @back="handleBack" />
    <DebugOverlay />
  </div>
</template>
