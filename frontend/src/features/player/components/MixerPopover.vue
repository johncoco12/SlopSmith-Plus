<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/features/player/store'
import { getMonitorVolume, setMonitorVolume } from '@/features/player/services/pitchDetection'
import type { FaderDescriptor } from '@/types'

const player = usePlayerStore()
const { t } = useI18n()
const faders = ref<FaderDescriptor[]>([])
const monitorVol = ref(getMonitorVolume())

let _unsubscribe: (() => void) | null = null

onMounted(() => {
  const api = window.slopsmith?.audio
  if (!api) return
  faders.value = api.getFaders?.() ?? []
  _unsubscribe = api.onFadersChange?.(() => {
    faders.value = api.getFaders?.() ?? []
  }) ?? null
})

onUnmounted(() => {
  _unsubscribe?.()
})

function setValue(fader: FaderDescriptor, v: number): void {
  fader.setValue(v)
  faders.value = [...faders.value]
}

function onMonitorInput(v: number): void {
  setMonitorVolume(v)
  monitorVol.value = v
}
</script>

<template>
  <div class="flex flex-col bg-dark-700 border border-white/[.06] rounded-xl shadow-2xl p-3 min-w-[240px] max-w-[480px]">
    <p class="text-xs font-medium text-gray-400 mb-3">{{ $t('player.mixer.title') }}</p>

    <div class="flex gap-2 overflow-x-auto pb-1">
      <!-- Master -->
      <div class="mixer-strip shrink-0">
        <label>{{ $t('player.mixer.master') }}</label>
        <input
          type="range"
          :value="player.masterVolume"
          min="0" max="100" step="1"
          class="w-16 accent-accent"
          style="writing-mode: vertical-lr; direction: rtl; width: 24px; height: 80px;"
          @input="player.setVolume(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="text-[10px] text-gray-500 tabular-nums">{{ player.masterVolume }}</span>
      </div>

      <!-- Song -->
      <div class="mixer-strip shrink-0">
        <label>{{ $t('player.mixer.song') }}</label>
        <input
          type="range"
          :value="player.songVolume"
          min="0" max="100" step="1"
          class="w-16 accent-accent"
          style="writing-mode: vertical-lr; direction: rtl; width: 24px; height: 80px;"
          @input="player.setSongVolume(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="text-[10px] text-gray-500 tabular-nums">{{ player.songVolume }}</span>
      </div>

      <!-- Monitor -->
      <div class="mixer-strip shrink-0">
        <label>{{ $t('player.mixer.monitor') }}</label>
        <input
          type="range"
          :value="monitorVol"
          min="0" max="2" step="0.05"
          style="writing-mode: vertical-lr; direction: rtl; width: 24px; height: 80px;"
          class="accent-accent"
          @input="onMonitorInput(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="text-[10px] text-gray-500 tabular-nums">{{ monitorVol.toFixed(2) }}</span>
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
          @input="setValue(fader, Number(($event.target as HTMLInputElement).value))"
        />
        <span class="text-[10px] text-gray-500 tabular-nums">
          {{ fader.getValue().toFixed(2) }}{{ fader.unit ?? '' }}
        </span>
      </div>
    </div>
  </div>
</template>
