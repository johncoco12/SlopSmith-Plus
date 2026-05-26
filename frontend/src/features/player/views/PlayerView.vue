<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayerStore } from '@/features/player/store'
import { useShortcuts } from '@/composables/useShortcuts'
import PlayerCanvas from '@/features/player/components/PlayerCanvas.vue'
import PlayerHud from '@/features/player/components/PlayerHud.vue'
import PlayerControls from '@/features/player/components/PlayerControls.vue'
import DebugOverlay from '@/features/player/components/DebugOverlay.vue'
import SectionBar from '@/features/player/components/SectionBar.vue'

const route  = useRoute()
const router = useRouter()
const player = usePlayerStore()

const trackId     = computed(() => route.params.trackId as string)
const arrangement = computed(() => Number(route.query.arrangement ?? 0))

const playerCanvas = ref<InstanceType<typeof PlayerCanvas> | null>(null)

// Load song whenever trackId/arrangement changes
// (usePlayer inside PlayerCanvas handles frame loop & timing)
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
    <!-- Loading overlay -->
    <Transition name="fade">
      <div
        v-if="player.loading"
        class="absolute inset-0 z-50 flex items-center justify-center bg-dark-800/80 backdrop-blur-sm"
      >
        <div class="flex flex-col items-center gap-4">
          <svg class="animate-spin h-10 w-10 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span class="text-sm text-gray-400">{{ $t('player.loadingTrack') }}</span>
        </div>
      </div>
    </Transition>

    <!-- Canvas + HUD wrapper -->
    <div class="relative flex-1 min-h-0 flex flex-col">
      <PlayerCanvas ref="playerCanvas" />
      <PlayerHud />
      <SectionBar />
      <!-- Bottom gradient bleed into controls -->
      <div
        class="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-dark-800/75 to-transparent pointer-events-none z-10"
      />
    </div>

    <!-- Controls bar -->
    <PlayerControls @back="handleBack" />
    <DebugOverlay />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
