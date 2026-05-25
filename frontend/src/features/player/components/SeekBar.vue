<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlayerStore } from '@/features/player/store'
import { formatTime } from '@/utils/format'

const player = usePlayerStore()
const trackEl    = ref<HTMLElement | null>(null)
const isDragging = ref<boolean>(false)
const hoverRatio = ref<number | null>(null)

const progress = computed(() =>
  player.duration > 0 ? player.currentTime / player.duration : 0
)

const loopRegion = computed(() => {
  if (player.loopA === null || player.loopB === null || !player.duration) return null
  const a = Math.min(player.loopA, player.loopB) / player.duration
  const b = Math.max(player.loopA, player.loopB) / player.duration
  return { left: a * 100, width: (b - a) * 100 }
})

const loopAMarker = computed(() => {
  if (player.loopA === null || player.loopB !== null || !player.duration) return null
  return (player.loopA / player.duration) * 100
})

const tooltipLeft = computed(() => {
  if (hoverRatio.value === null) return null
  return Math.max(2, Math.min(98, hoverRatio.value * 100))
})

function ratioFromEvent(e: PointerEvent): number {
  const rect = trackEl.value!.getBoundingClientRect()
  return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
}

function onPointerdown(e: PointerEvent): void {
  isDragging.value = true
  ;(trackEl.value as HTMLElement).setPointerCapture(e.pointerId)
  player.seekTo(ratioFromEvent(e) * player.duration)
}

function onPointermove(e: PointerEvent): void {
  const r = ratioFromEvent(e)
  hoverRatio.value = r
  if (isDragging.value) player.seekTo(r * player.duration)
}

function onPointerup(): void    { isDragging.value = false }
function onPointerleave(): void { if (!isDragging.value) hoverRatio.value = null }
</script>

<template>
  <div class="px-3 pt-3 pb-1 select-none">
    <!-- Track hit area -->
    <div
      ref="trackEl"
      class="relative h-5 flex items-center cursor-pointer group/seek"
      style="touch-action: none"
      @pointerdown="onPointerdown"
      @pointermove="onPointermove"
      @pointerup="onPointerup"
      @pointerleave="onPointerleave"
    >
      <!-- Track background -->
      <div
        class="absolute inset-x-0 rounded-full bg-white/[.08] transition-all duration-150"
        :class="isDragging ? 'h-[5px]' : 'h-[3px] group-hover/seek:h-[4px]'"
      >
        <!-- Loop region -->
        <div
          v-if="loopRegion"
          class="absolute top-0 bottom-0 rounded-full bg-accent/35"
          :style="{ left: loopRegion.left + '%', width: loopRegion.width + '%' }"
        />

        <!-- Loop A-only marker (hairline) -->
        <div
          v-if="loopAMarker !== null"
          class="absolute top-0 bottom-0 w-0.5 rounded-full bg-accent/70"
          :style="{ left: loopAMarker + '%' }"
        />

        <!-- Progress fill -->
        <div
          class="absolute top-0 left-0 bottom-0 rounded-full bg-accent"
          :style="{ width: (progress * 100) + '%' }"
        />

        <!-- Playhead thumb -->
        <div
          class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white
                 shadow transition-all duration-150"
          :class="isDragging ? 'scale-125 opacity-100' : 'scale-0 group-hover/seek:scale-100 opacity-100'"
          :style="{ left: (progress * 100) + '%' }"
        />
      </div>

      <!-- Hover time tooltip -->
      <div
        v-if="tooltipLeft !== null"
        class="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none z-20"
        :style="{ left: tooltipLeft + '%' }"
      >
        <div class="px-1.5 py-0.5 rounded-md bg-dark-600 border border-white/[.10]
                    text-[10px] font-mono tabular-nums text-gray-200 whitespace-nowrap shadow-lg">
          {{ formatTime((hoverRatio ?? 0) * player.duration) }}
        </div>
      </div>
    </div>

    <!-- Time labels -->
    <div class="flex justify-between mt-1 px-0.5 text-[10px] font-mono tabular-nums text-gray-600">
      <span>{{ formatTime(player.currentTime) }}</span>
      <span>{{ formatTime(player.duration) }}</span>
    </div>
  </div>
</template>
