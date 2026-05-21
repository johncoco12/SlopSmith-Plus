<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'

const player = usePlayerStore()

const songTitle = computed(() => player.songInfo?.title       ?? '')
const artist    = computed(() => player.songInfo?.artist      ?? '')
const arrName   = computed(() => player.songInfo?.arrangement ?? '')
const avOffset  = computed(() => {
  const ms = player.avOffsetMs
  if (!ms) return ''
  return `A/V ${ms > 0 ? '+' : ''}${ms}ms`
})
</script>

<template>
  <div class="absolute inset-x-0 top-0 pointer-events-none select-none z-10">
    <!-- Gradient scrim for readability -->
    <div class="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />

    <!-- Song info -->
    <div class="relative flex items-start justify-between px-4 pt-3.5 gap-4">
      <!-- Left: artist / title / arrangement -->
      <div class="min-w-0">
        <p class="text-sm font-semibold text-white/90 leading-snug truncate drop-shadow">
          <span v-if="artist" class="text-white/60">{{ artist }}</span>
          <span v-if="artist && songTitle" class="text-white/40 mx-1">—</span>
          <span>{{ songTitle }}</span>
        </p>
        <p v-if="arrName" class="text-[11px] text-white/45 mt-0.5 font-medium">{{ arrName }}</p>
      </div>

      <!-- Right: A/V offset warning (only when non-zero) -->
      <Transition
        enter-active-class="transition-all duration-200"
        enter-from-class="opacity-0 translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-150"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-1"
      >
        <span
          v-if="avOffset"
          class="text-[10px] font-mono font-medium text-yellow-400/80 shrink-0 mt-0.5"
        >{{ avOffset }}</span>
      </Transition>
    </div>
  </div>
</template>
