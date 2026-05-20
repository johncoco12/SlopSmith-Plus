<script setup>
import { ref, computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import {
  ArrowLeft, SkipBack, Play, Pause, SkipForward,
  Mic2, Monitor, SlidersHorizontal, Timer,
} from 'lucide-vue-next'
import SeekBar from './SeekBar.vue'
import VizPicker from './VizPicker.vue'
import LoopControls from './LoopControls.vue'
import MixerPopover from './MixerPopover.vue'

const emit = defineEmits(['back'])
const player = usePlayerStore()

const mixerOpen  = ref(false)
const arrangements = computed(() => player.songInfo?.arrangements ?? [])
</script>

<template>
  <div class="relative z-10 bg-dark-800/95 backdrop-blur-md border-t border-white/[.05]">

    <!-- ── Row 1: Seek bar ── -->
    <SeekBar />

    <!-- ── Row 2: Primary controls ── -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-white/[.04]">

      <!-- Back -->
      <button class="player-btn" title="Back to library (Esc)" @click="emit('back')">
        <ArrowLeft :size="16" />
      </button>

      <div class="ctrl-sep" />

      <!-- Transport -->
      <div class="flex items-center gap-0.5">
        <button class="player-btn" title="Seek −5s (←)" @click="player.seekBy(-5)">
          <SkipBack :size="15" />
        </button>
        <button
          class="player-btn-play"
          :title="player.playing ? 'Pause (Space)' : 'Play (Space)'"
          @click="player.togglePlay()"
        >
          <Pause v-if="player.playing" :size="18" />
          <Play v-else :size="18" class="translate-x-px" />
        </button>
        <button class="player-btn" title="Seek +5s (→)" @click="player.seekBy(5)">
          <SkipForward :size="15" />
        </button>
      </div>

      <div class="ctrl-sep" />

      <!-- Arrangement -->
      <select
        v-if="arrangements.length > 1"
        :value="player.arrangement"
        class="ctrl-select"
        title="Arrangement"
        @change="player.changeArrangement(Number($event.target.value))"
      >
        <option v-for="(arr, i) in arrangements" :key="i" :value="i">{{ arr.name ?? arr }}</option>
      </select>

      <div class="flex-1" />

      <!-- Lyrics -->
      <button
        class="player-btn"
        :class="{ active: player.showLyrics }"
        title="Toggle lyrics (\)"
        @click="player.toggleLyrics()"
      >
        <Mic2 :size="15" />
      </button>

      <!-- Visualization picker -->
      <div class="flex items-center gap-1.5">
        <Monitor :size="12" class="text-gray-600 shrink-0" />
        <VizPicker />
      </div>

      <!-- Mixer -->
      <div class="relative">
        <button
          class="player-btn"
          :class="{ active: mixerOpen }"
          title="Mixer"
          @click="mixerOpen = !mixerOpen"
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
        <Timer :size="12" class="text-gray-600 shrink-0" />
        <span
          class="text-[10px] font-mono tabular-nums min-w-[46px] text-right cursor-default"
          :class="player.avOffsetMs !== 0 ? 'text-yellow-400/80' : 'text-gray-600'"
          title="A/V sync offset — double-click to reset"
          @dblclick="player.setAvOffset(0)"
        >{{ player.avOffsetMs > 0 ? '+' : '' }}{{ player.avOffsetMs }}ms</span>
        <button class="player-btn-xs" title="A/V −10ms ([)" @click="player.nudgeAvOffset(-10)">−</button>
        <button class="player-btn-xs" title="A/V +10ms (])" @click="player.nudgeAvOffset(10)">+</button>
      </div>
    </div>

    <!-- ── Row 3: Practice controls ── -->
    <div class="flex items-center gap-3 px-3 py-2 flex-wrap">

      <!-- Speed -->
      <div class="ctrl-slider-group">
        <span class="ctrl-slider-label">Speed</span>
        <input
          type="range"
          :value="player.speed"
          min="0.25" max="1.5" step="0.05"
          class="ctrl-range w-20"
          title="Playback speed"
          @input="player.setSpeed(Number($event.target.value))"
        />
        <span class="ctrl-slider-val w-9">{{ Math.round(player.speed * 100) }}%</span>
      </div>

      <!-- Mastery -->
      <div class="ctrl-slider-group">
        <span class="ctrl-slider-label">Mastery</span>
        <input
          type="range"
          :value="player.mastery"
          min="0" max="100" step="1"
          class="ctrl-range w-20"
          title="Difficulty filter"
          @input="player.setMastery(Number($event.target.value))"
        />
        <span class="ctrl-slider-val w-8">{{ player.mastery }}%</span>
      </div>

      <div class="ctrl-sep" />

      <!-- Loop controls -->
      <LoopControls />
    </div>
  </div>
</template>
