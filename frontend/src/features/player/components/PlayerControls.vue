<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/features/player/store'
import {
  ArrowLeft, SkipBack, Play, Pause, SkipForward,
  Mic2, Guitar, Gauge, Monitor, SlidersHorizontal, Timer,
} from 'lucide-vue-next'
import SeekBar from './SeekBar.vue'
import VizPicker from './VizPicker.vue'
import RendererPicker from './RendererPicker.vue'
import LoopControls from './LoopControls.vue'
import MixerPopover from './MixerPopover.vue'
import TunerPopover from './TunerPopover.vue'
import LatencyTester from './LatencyTester.vue'
const emit = defineEmits<{
  back: []
}>()
const { t } = useI18n()
const player = usePlayerStore()

const mixerOpen         = ref<boolean>(false)
const tunerOpen         = ref<boolean>(false)
const latencyTesterOpen = ref<boolean>(false)
const latencyGuided     = ref<boolean>(false)
const arrangements = computed(() => player.songInfo?.arrangements ?? [])

// Show the calibration prompt until the user has measured input latency (or dismissed it).
const LS_LATENCY_DISMISSED = 'latency_prompt_dismissed'
const showCalibrationPrompt = ref(
  localStorage.getItem('pitch_yin.inputLatencyMs') === null &&
  localStorage.getItem(LS_LATENCY_DISMISSED) !== 'true'
)

function openCalibration(guided: boolean): void {
  latencyGuided.value     = guided
  latencyTesterOpen.value = true
}

function onTesterClose(): void {
  latencyTesterOpen.value = false
  // Hide prompt once input latency has been saved
  if (localStorage.getItem('pitch_yin.inputLatencyMs') !== null) {
    showCalibrationPrompt.value = false
  }
}

function dismissPrompt(): void {
  localStorage.setItem(LS_LATENCY_DISMISSED, 'true')
  showCalibrationPrompt.value = false
}
</script>

<template>
  <div class="relative z-10 bg-dark-800/95 backdrop-blur-md border-t border-white/[.05]">

    <!-- ── Row 1: Seek bar ── -->
    <SeekBar />

    <!-- ── Calibration prompt (shown until input latency is measured) ── -->
    <Transition
      enter-active-class="transition-all duration-200 overflow-hidden"
      enter-from-class="max-h-0 opacity-0"
      enter-to-class="max-h-20 opacity-100"
      leave-active-class="transition-all duration-150 overflow-hidden"
      leave-from-class="max-h-20 opacity-100"
      leave-to-class="max-h-0 opacity-0"
    >
      <div
        v-if="showCalibrationPrompt"
        class="flex items-center gap-2.5 px-3 py-1.5 bg-accent/10 border-b border-accent/20 text-[11px]"
      >
        <Timer :size="12" class="text-accent shrink-0" />
        <span class="text-gray-300 flex-1">{{ $t('player.calibration.prompt') }}</span>
        <button
          class="px-2 py-0.5 rounded bg-accent hover:bg-accent/80 text-white font-semibold transition-colors"
          @click="openCalibration(true)"
        >
          {{ $t('player.calibration.button') }}
        </button>
        <button class="text-gray-500 hover:text-gray-300 transition-colors" :title="$t('player.controls.dismiss')" @click="dismissPrompt">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </Transition>

    <!-- ── Row 2: Primary controls ── -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-white/[.04]">

      <!-- Back -->
      <button class="player-btn" :title="$t('player.controls.backTitle')" @click="emit('back')">
        <ArrowLeft :size="16" />
      </button>

      <div class="ctrl-sep" />

      <!-- Transport -->
      <div class="flex items-center gap-0.5">
        <button class="player-btn" :title="$t('player.controls.seekBackTitle')" @click="player.seekBy(-5)">
          <SkipBack :size="15" />
        </button>
        <button
          class="player-btn-play"
          :title="player.playing ? $t('player.controls.pauseTitle') : $t('player.controls.playTitle')"
          @click="player.togglePlay()"
        >
          <Pause v-if="player.playing" :size="18" />
          <Play v-else :size="18" class="translate-x-px" />
        </button>
        <button class="player-btn" :title="$t('player.controls.seekForwardTitle')" @click="player.seekBy(5)">
          <SkipForward :size="15" />
        </button>
      </div>

      <div class="ctrl-sep" />

      <!-- Arrangement -->
      <select
        v-if="arrangements.length > 1"
        :value="player.arrangement"
        class="ctrl-select"
        :title="$t('player.controls.arrangementTitle')"
        @change="player.changeArrangement(Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="(arr, i) in arrangements" :key="i" :value="i">{{ arr.name ?? arr }}</option>
      </select>

      <div class="ctrl-sep" />

      <!-- Speed -->
      <div class="ctrl-slider-group">
        <span class="ctrl-slider-label">{{ $t('player.controls.speed') }}</span>
        <input
          type="range"
          :value="player.speed"
          min="0.25" max="1.5" step="0.05"
          class="ctrl-range w-20"
          :title="$t('player.controls.speedTitle')"
          @input="player.setSpeed(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="ctrl-slider-val w-9">{{ Math.round(player.speed * 100) }}%</span>
      </div>

      <!-- Mastery -->
      <div class="ctrl-slider-group">
        <span class="ctrl-slider-label">{{ $t('player.controls.mastery') }}</span>
        <input
          type="range"
          :value="player.mastery"
          min="0" max="100" step="1"
          class="ctrl-range w-20"
          :title="$t('player.controls.masteryTitle')"
          @input="player.setMastery(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="ctrl-slider-val w-8">{{ player.mastery }}%</span>
      </div>

      <div class="ctrl-sep" />

      <!-- Loop controls -->
      <LoopControls />

      <div class="flex-1" />

      <!-- Play-along pitch detection -->
      <button
        class="player-btn"
        :class="{ active: player.pitchDetectionEnabled }"
        :title="$t('player.controls.micTitle')"
        @click="player.togglePitchDetection()"
      >
        <Guitar :size="15" />
      </button>

      <!-- Lyrics -->
      <button
        class="player-btn"
        :class="{ active: player.showLyrics }"
        :title="$t('player.controls.lyricsTitle')"
        @click="player.toggleLyrics()"
      >
        <Mic2 :size="15" />
      </button>

      <!-- Visualization picker -->
      <div class="flex items-center gap-1.5">
        <Monitor :size="12" class="text-gray-600 shrink-0" />
        <RendererPicker />
        <VizPicker />
      </div>

      <!-- Tuner -->
      <div class="relative">
        <button
          class="player-btn"
          :class="{ active: tunerOpen }"
          :title="$t('player.controls.tunerTitle')"
          @click="tunerOpen = !tunerOpen; mixerOpen = false"
        >
          <Gauge :size="15" />
        </button>
        <Transition
          enter-active-class="transition-all duration-150 origin-bottom-right"
          enter-from-class="scale-95 opacity-0"
          enter-to-class="scale-100 opacity-100"
          leave-active-class="transition-all duration-100 origin-bottom-right"
          leave-from-class="scale-100 opacity-100"
          leave-to-class="scale-95 opacity-0"
        >
          <div v-if="tunerOpen" class="absolute bottom-full mb-2 right-0 z-50">
            <TunerPopover />
          </div>
        </Transition>
      </div>

      <!-- Mixer -->
      <div class="relative">
        <button
          class="player-btn"
          :class="{ active: mixerOpen }"
          :title="$t('player.controls.mixerTitle')"
          @click="mixerOpen = !mixerOpen; tunerOpen = false"
        >
          <SlidersHorizontal :size="15" />
        </button>
        <Transition
          enter-active-class="transition-all duration-150 origin-bottom-right"
          enter-from-class="scale-95 opacity-0"
          enter-to-class="scale-100 opacity-100"
          leave-active-class="transition-all duration-100 origin-bottom-right"
          leave-from-class="scale-100 opacity-100"
          leave-to-class="scale-95 opacity-0"
        >
          <div v-if="mixerOpen" class="absolute bottom-full mb-2 right-0 z-50">
            <MixerPopover />
          </div>
        </Transition>
      </div>

      <div class="ctrl-sep" />

      <!-- A/V offset nudge -->
      <div class="flex items-center gap-1">
        <button
          class="player-btn-xs rounded px-0.5"
          :class="{ 'text-accent': latencyTesterOpen }"
          :title="$t('player.controls.latencyTitle')"
          @click="openCalibration(false)"
        >
          <Timer :size="12" />
        </button>
        <span
          class="text-[10px] font-mono tabular-nums min-w-[46px] text-right cursor-default"
          :class="player.avOffsetMs !== 0 ? 'text-yellow-400/80' : 'text-gray-600'"
          :title="$t('player.controls.avSyncTitle')"
          @dblclick="player.setAvOffset(0)"
        >{{ player.avOffsetMs > 0 ? '+' : '' }}{{ player.avOffsetMs }}ms</span>
        <button class="player-btn-xs" :title="$t('player.controls.avMinus')" @click="player.nudgeAvOffset(-10)">−</button>
        <button class="player-btn-xs" :title="$t('player.controls.avPlus')" @click="player.nudgeAvOffset(10)">+</button>
      </div>
    </div>
  </div>

  <!-- Latency tester modal (teleported to body so it overlays everything) -->
  <Teleport to="body">
    <LatencyTester v-if="latencyTesterOpen" :guided="latencyGuided" @close="onTesterClose" />
  </Teleport>
</template>
