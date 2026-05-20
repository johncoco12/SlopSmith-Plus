<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '@/stores/player'

const player = usePlayerStore()
const faders = ref([])

let _unsubscribe = null

onMounted(() => {
  // Read faders registered by audio-mixer.js
  const api = window.slopsmith?.audio
  if (!api) return
  faders.value = api.getFaders?.() ?? []

  // Re-read when faders change
  _unsubscribe = api.onFadersChange?.(() => {
    faders.value = api.getFaders?.() ?? []
  })
})

onUnmounted(() => {
  _unsubscribe?.()
})

function setValue(fader, v) {
  fader.setValue(v)
  // Force re-render
  faders.value = [...faders.value]
}
</script>

<template>
  <div class="flex flex-col bg-dark-700 border border-white/[.06] rounded-xl shadow-2xl p-3 min-w-[240px] max-w-[480px]">
    <p class="text-xs font-medium text-gray-400 mb-3">Mixer</p>

    <!-- Volume strips -->
    <div class="flex gap-2 overflow-x-auto pb-1">
      <!-- Master volume -->
      <div class="mixer-strip shrink-0">
        <label>Master</label>
        <input
          type="range"
          :value="player.masterVolume"
          min="0" max="100" step="1"
          class="w-16 accent-accent"
          style="writing-mode: vertical-lr; direction: rtl; width: 24px; height: 80px;"
          @input="player.setVolume(Number($event.target.value))"
        />
        <span class="text-[10px] text-gray-500 tabular-nums">{{ player.masterVolume }}</span>
      </div>

      <!-- Plugin faders -->
      <div
        v-for="fader in faders"
        :key="fader.id"
        class="mixer-strip shrink-0"
      >
        <label :title="fader.label">{{ fader.label }}</label>
        <input
          type="range"
          :value="fader.getValue()"
          :min="fader.min ?? 0"
          :max="fader.max ?? 2"
          :step="fader.step ?? 0.05"
          style="writing-mode: vertical-lr; direction: rtl; width: 24px; height: 80px;"
          class="accent-accent"
          @input="setValue(fader, Number($event.target.value))"
        />
        <span class="text-[10px] text-gray-500 tabular-nums">
          {{ fader.getValue().toFixed(2) }}{{ fader.unit ?? '' }}
        </span>
      </div>
    </div>
  </div>
</template>
