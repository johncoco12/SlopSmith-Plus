<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '@/stores/player'

const player = usePlayerStore()

// ── Tuning helpers (mirrors tunings.py + highway_3d's _baseOpenStringMidis) ──

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Open-string MIDI numbers, thick → thin, index = RS string number (0 = lowest string)
const BASE_GUITAR6 = [40, 45, 50, 55, 59, 64]  // E2 A2 D3 G3 B3 E4
const BASE_GUITAR7 = [35, 40, 45, 50, 55, 59, 64]
const BASE_BASS4   = [28, 33, 38, 43]            // E1 A1 D2 G2
const BASE_BASS5   = [23, 28, 33, 38, 43]        // B0 E1 A1 D2 G2

function _baseMidis(stringCount, arrangement) {
  const isBass = /bass/i.test(arrangement ?? '')
  if (isBass && stringCount === 5) return BASE_BASS5
  if (isBass)                      return BASE_BASS4
  if (stringCount === 7)           return BASE_GUITAR7
  return BASE_GUITAR6.slice(0, Math.min(stringCount, 6))
}

function _midiToNote(midi) {
  const m = Math.round(midi)
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1)
}

function _noteHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function _tuningName(offsets) {
  if (!offsets?.length) return 'E Standard'
  if (offsets.length === 6 && offsets.every(o => o === offsets[0])) {
    const std = { 0: 'E Standard', '-1': 'Eb Standard', '-2': 'D Standard',
      '-3': 'C# Standard', '-4': 'C Standard', '-5': 'B Standard',
      '-6': 'Bb Standard', 1: 'F Standard', 2: 'F# Standard' }
    const n = std[String(offsets[0])]
    if (n) return n
  }
  // Drop tunings: low string is 2 below the rest
  if (offsets.length === 6 && offsets[0] === offsets[1] - 2 && offsets.slice(1).every(o => o === offsets[1])) {
    return 'Drop ' + NOTE_NAMES[((40 + offsets[0]) % 12 + 12) % 12]  // 40 = E2 = standard low E
  }
  const named = {
    '-2,0,0,0,0,0': 'Drop D', '-4,-2,-2,-2,-2,-2': 'Drop C',
    '-2,-2,0,0,0,0': 'Double Drop D', '0,0,0,-1,0,0': 'Open G',
    '-2,-2,0,0,-2,-2': 'Open D', '-2,0,0,0,-2,0': 'DADGAD',
    '0,2,2,1,0,0': 'Open E',
  }
  return named[offsets.join(',')] ?? offsets.map(o => (o > 0 ? '+' : '') + o).join(' ')
}

// ── Computed string targets ───────────────────────────────────────────────────

const stringTargets = computed(() => {
  const info = player.songInfo ?? {}
  if (!info.tuning && !info.arrangement) return []
  const sc = player.highway?.getStringCount?.()
    ?? (Array.isArray(info.tuning) ? info.tuning.length : 6)
  const tuning = Array.isArray(info.tuning) ? info.tuning : []
  const capo   = Number.isFinite(info.capo) ? info.capo : 0
  const bases  = _baseMidis(sc, info.arrangement ?? '')
  return Array.from({ length: sc }, (_, s) => {
    const off  = Number.isFinite(tuning[s]) ? tuning[s] : 0
    const midi = (bases[s] ?? 40) + off + capo
    return { string: s, midi, note: _midiToNote(midi), hz: _noteHz(midi) }
  })
})

const tuningLabel = computed(() => {
  const t = player.songInfo?.tuning
  return t?.length ? _tuningName(t) : ''
})

const capoLabel = computed(() => {
  const c = player.songInfo?.capo
  return Number.isFinite(c) && c > 0 ? `capo ${c}` : ''
})

// ── Live pitch detection ──────────────────────────────────────────────────────

interface DetectedNote { note: string; cents: number; midi: number; midiExact: number }

// detected: { note, cents (sub-semitone, ±50), midi (rounded) } | null
const detected = ref<DetectedNote | null>(null)
let _fadeTimer: ReturnType<typeof setTimeout> | null = null

function _onPitch(event: Event): void {
  const hz = (event as CustomEvent).detail?.hz ?? (event as any).hz
  if (!hz || hz <= 0) return
  const midiExact = 69 + 12 * Math.log2(hz / 440)
  const midiR     = Math.round(midiExact)
  const cents      = Math.round((midiExact - midiR) * 100)
  detected.value  = { note: _midiToNote(midiR), cents, midi: midiR, midiExact }
  clearTimeout(_fadeTimer ?? undefined)
  _fadeTimer = setTimeout(() => { detected.value = null }, 600)
}

onMounted(()  => window.slopsmith?.on('pitch:detected', _onPitch))
onUnmounted(() => {
  window.slopsmith?.off('pitch:detected', _onPitch)
  clearTimeout(_fadeTimer ?? undefined)
})

// ── Meter computations ────────────────────────────────────────────────────────

// Index of the string whose target MIDI is closest to the detected pitch
const closestString = computed(() => {
  if (!detected.value) return -1
  let best = -1, bestDiff = Infinity
  for (const t of stringTargets.value) {
    const diff = Math.abs(t.midi - detected.value.midi)
    if (diff < bestDiff) { bestDiff = diff; best = t.string }
  }
  return bestDiff <= 7 ? best : -1  // ignore if more than 7 semitones away
})

// Cents deviation of detected pitch from the closest target string's expected note
// (positive = sharp, negative = flat)
const fineCents = computed(() => {
  if (!detected.value || closestString.value < 0) return null
  const t = stringTargets.value.find(x => x.string === closestString.value)
  if (!t) return null
  return Math.round((detected.value.midiExact - t.midi) * 100)
})

const needleColor = computed(() => {
  const c = fineCents.value
  if (c === null) return '#6b7280'
  const a = Math.abs(c)
  if (a <= 5) return '#22c55e'
  if (a <= 20) return '#e8c040'
  return '#ef4444'
})

// 0% = −50¢, 50% = 0¢, 100% = +50¢ — clamped to keep needle visible
const needlePct = computed(() => {
  const c = fineCents.value
  if (c === null) return 50
  return Math.max(2, Math.min(98, 50 + (c / 50) * 50))
})
</script>

<template>
  <div class="flex flex-col bg-dark-700 border border-white/[.06] rounded-xl shadow-2xl p-3 w-[260px]">

    <!-- Header: tuning name + capo -->
    <div class="flex items-center justify-between mb-3">
      <p class="text-xs font-medium text-gray-400">Tune to song</p>
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-accent">{{ tuningLabel || 'E Standard' }}</span>
        <span v-if="capoLabel" class="text-[10px] text-gray-500">{{ capoLabel }}</span>
      </div>
    </div>

    <!-- String list: high string at top (guitar-tuner convention = reversed) -->
    <div v-if="stringTargets.length" class="flex flex-col gap-0.5 mb-3">
      <div
        v-for="t in [...stringTargets].reverse()"
        :key="t.string"
        class="flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors duration-100"
        :class="closestString === t.string ? 'bg-white/[.07] text-white' : 'text-gray-400'"
      >
        <!-- String number (1 = thickest/lowest) -->
        <span class="w-4 text-right text-[10px] tabular-nums text-gray-600 shrink-0">{{ t.string + 1 }}</span>
        <!-- Target note -->
        <span class="font-mono font-semibold w-8 shrink-0">{{ t.note }}</span>
        <!-- Hz reference -->
        <span class="tabular-nums text-gray-600 text-[10px] flex-1">{{ t.hz.toFixed(1) }} Hz</span>
        <!-- Cents deviation shown only for the highlighted string -->
        <span
          v-if="closestString === t.string && fineCents !== null"
          class="text-[10px] font-mono tabular-nums shrink-0"
          :style="{ color: needleColor }"
        >{{ fineCents > 0 ? '+' : '' }}{{ fineCents }}¢</span>
      </div>
    </div>

    <div v-else class="text-xs text-gray-500 mb-3 py-1">Load a song to see target notes</div>

    <!-- Live chromatic tuner display -->
    <div class="border-t border-white/[.04] pt-2.5">
      <!-- Detected note label -->
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] text-gray-500">Detected</span>
        <Transition
          enter-active-class="transition-all duration-75"
          enter-from-class="opacity-0 scale-90"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-200"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-90"
        >
          <span v-if="detected" class="text-base font-bold font-mono" :style="{ color: needleColor }">
            {{ detected.note }}
          </span>
          <span v-else class="text-xs text-gray-600">—</span>
        </Transition>
      </div>

      <!-- Meter bar -->
      <div class="relative h-3 bg-dark-600 rounded-full overflow-visible">
        <!-- Background zones: yellow flanks, green centre -->
        <div class="absolute inset-y-0 left-[30%] w-[15%] bg-yellow-400/10 rounded-l" />
        <div class="absolute inset-y-0 right-[30%] w-[15%] bg-yellow-400/10 rounded-r" />
        <div class="absolute inset-y-0 left-[45%] w-[10%] bg-green-500/20" />
        <!-- Centre tick -->
        <div class="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
        <!-- Needle -->
        <div
          v-if="detected"
          class="absolute top-1/2 -translate-y-1/2 w-1.5 h-5 -translate-x-1/2 rounded-full shadow-sm"
          :style="{ left: needlePct + '%', background: needleColor, transition: 'left 80ms ease-out, background 120ms' }"
        />
      </div>

      <!-- Scale labels -->
      <div class="flex justify-between text-[9px] text-gray-600 mt-1 px-0.5 select-none">
        <span>−50¢</span>
        <span>flat · · · in tune · · · sharp</span>
        <span>+50¢</span>
      </div>

      <!-- Nudge when mic is off -->
      <p v-if="!player.pitchDetectionEnabled" class="text-[10px] text-gray-500 mt-2.5 text-center">
        Press <kbd class="bg-dark-600 border border-gray-700 rounded px-1 text-[9px]">M</kbd>
        or click the mic button to start detection
      </p>
    </div>
  </div>
</template>
