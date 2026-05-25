<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/features/player/store'
import { X, Mic, MousePointer2 } from 'lucide-vue-next'
import { start as pitchStart, isRunning as isPitchRunning } from '@/features/player/services/pitchDetection'

const { t } = useI18n()

const props = defineProps<{
  guided?: boolean
}>()
const emit = defineEmits<{
  close: []
}>()
const player = usePlayerStore()

// ── Config ────────────────────────────────────────────────────────────────────
// Phase 1 — audio tap
const BPM        = 80
const BEAT_SEC   = 60 / BPM   // 0.75 s
const TOTAL_TAPS = 10
const WARMUP     = 2

// Phase 2 — E-string detection (slower clicks, fewer reps)
const G_BEAT_SEC  = 2.0   // 2 s between clicks — easy to react to
const G_TAPS      = 5     // target detections
const G_WARMUP    = 1     // discard first rep (reaction warmup)

// ── State machine ─────────────────────────────────────────────────────────────
// idle → counting → running-audio → audio-done
//                                 → counting2 → running-guitar → done
const phase     = ref('idle')
const countdown = ref(0)

// Phase 1: audio tap
const tapCount   = ref(0)
const tapOffsets = ref([])
const audioMs    = ref(null)      // median audio output latency

// Phase 2: guitar detection
const guitarCount   = ref(0)
const guitarOffsets = ref([])
const guitarMs      = ref(null)   // median (audio_out + input_pipeline)
const lastNote      = ref(null)   // last detected note name

// inputMs cancels out the common reaction-time term:
// both phases use the same audio click → same reaction time → it subtracts away.
const inputMs = computed(() =>
  audioMs.value !== null && guitarMs.value !== null
    ? Math.round(guitarMs.value - audioMs.value)
    : null
)

// ── WebAudio pipeline ─────────────────────────────────────────────────────────
let _ctx: AudioContext | null        = null
let _beatTimes: number[]             = []   // AudioContext timestamps for each scheduled click
let _perfOrigin                      = 0    // maps AudioContext time → performance.now()
let _rafId: number | null            = null

const beatFlash = ref(false)

function _audioPerfMs(audioSec) {
  return _perfOrigin + audioSec * 1000
}

function _nearestBeat(perfMs, beatSec) {
  let best = -1, bestDiff = Infinity
  for (let i = 0; i < _beatTimes.length; i++) {
    const d = Math.abs(perfMs - _audioPerfMs(_beatTimes[i]))
    if (d < bestDiff) { bestDiff = d; best = i }
  }
  return bestDiff < beatSec * 500 ? best : -1
}

// Phase 1: pitched tone (880 Hz) — human taps when they hear it.
function _scheduleClicks(startSec) {
  const osc  = _ctx.createOscillator()
  const env  = _ctx.createGain()
  osc.connect(env)
  env.connect(_ctx.destination)
  osc.frequency.value = 880
  _beatTimes = []
  for (let i = 0; i < TOTAL_TAPS; i++) {
    const t = startSec + i * BEAT_SEC
    _beatTimes.push(t)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.4, t + 0.005)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
  }
  osc.start(startSec)
  osc.stop(startSec + TOTAL_TAPS * BEAT_SEC + 0.2)
}

// Phase 2: noise burst — audible as a click but NOT periodic, so YIN clarity stays
// below the detection threshold and the mic won't auto-trigger pitch:detected.
// The user's guitar string (sustained, pitched) will still register clearly.
function _scheduleNoiseClicks(startSec) {
  const sr          = _ctx.sampleRate
  const burstFrames = Math.ceil(0.025 * sr)   // 25 ms of noise
  _beatTimes = []
  for (let i = 0; i < GUITAR_BEATS; i++) {
    const t = startSec + i * G_BEAT_SEC
    _beatTimes.push(t)
    const buf  = _ctx.createBuffer(1, burstFrames, sr)
    const data = buf.getChannelData(0)
    for (let j = 0; j < burstFrames; j++) {
      // Tapered envelope: sharp attack, quick fade — sounds like a stick click
      data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / burstFrames, 2) * 0.5
    }
    const src  = _ctx.createBufferSource()
    src.buffer = buf
    src.connect(_ctx.destination)
    src.start(t)
  }
}

function _startFlashLoop(activePhase: string): void {
  const loop = () => {
    if (phase.value !== activePhase) return
    const now = performance.now()
    beatFlash.value = _beatTimes.some(t => Math.abs(now - _audioPerfMs(t)) < 150)
    _rafId = requestAnimationFrame(loop)
  }
  _rafId = requestAnimationFrame(loop)
}

function _median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function _stddev(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length)
}

function _consistency(offsets) {
  if (offsets.length < 2) return ''
  const sd = _stddev(offsets)
  if (sd < 15) return 'good'
  if (sd < 35) return 'fair'
  return 'poor — retry'
}

// ── Phase 1: Audio tap ────────────────────────────────────────────────────────

async function startAudioTest() {
  tapCount.value   = 0
  tapOffsets.value = []
  audioMs.value    = null

  _ctx = new AudioContext({ latencyHint: 'interactive' })
  _perfOrigin = performance.now() - _ctx.currentTime * 1000

  phase.value     = 'counting'
  countdown.value = 3
  const tick = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) { clearInterval(tick); _launchAudio() }
  }, 1000)
}

function _launchAudio() {
  const start = _ctx.currentTime + 0.05
  _perfOrigin = performance.now() - _ctx.currentTime * 1000
  _scheduleClicks(start)
  phase.value = 'running-audio'
  _startFlashLoop('running-audio')
}

function tap() {
  if (phase.value !== 'running-audio') return
  const idx = tapCount.value
  if (idx >= _beatTimes.length) return
  tapOffsets.value.push(performance.now() - _audioPerfMs(_beatTimes[idx]))
  tapCount.value++
  if (tapCount.value >= TOTAL_TAPS) _endAudio()
}

function _endAudio(): void {
  if (_rafId !== null) cancelAnimationFrame(_rafId); _rafId = null
  beatFlash.value = false
  _ctx?.close(); _ctx = null
  audioMs.value = Math.round(_median(tapOffsets.value.slice(WARMUP)))
  phase.value   = 'audio-done'
}

// ── Phase 2: E-string detection ───────────────────────────────────────────────

// Extra beats so a missed note never strands the user.
const GUITAR_BEATS = G_TAPS + G_WARMUP + 3

let _beatSeen: boolean[]              = []
let _guitarFinishTimer: ReturnType<typeof setTimeout> | null = null

// Accept any E note (midi class 4: E1 41Hz, E2 82Hz, E3 165Hz, E4 330Hz, E5 659Hz)
function _isENote(hz) {
  if (hz <= 0) return false
  return (((Math.round(69 + 12 * Math.log2(hz / 440))) % 12) + 12) % 12 === 4
}

async function startGuitarTest() {
  if (!isPitchRunning()) {
    try {
      await pitchStart()
      player.pitchDetectionEnabled = true
    } catch (e) {
      console.error('[latency-tester] mic start failed:', e)
      return
    }
  }

  guitarCount.value   = 0
  guitarOffsets.value = []
  guitarMs.value      = null
  lastNote.value      = null
  _beatSeen           = new Array(GUITAR_BEATS).fill(false)

  _ctx = new AudioContext({ latencyHint: 'interactive' })
  _perfOrigin = performance.now() - _ctx.currentTime * 1000

  phase.value     = 'counting2'
  countdown.value = 3
  const tick = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) { clearInterval(tick); _launchGuitar() }
  }, 1000)
}

function _launchGuitar() {
  const start = _ctx.currentTime + 0.05
  _perfOrigin = performance.now() - _ctx.currentTime * 1000
  _scheduleNoiseClicks(start)
  phase.value = 'running-guitar'
  _startFlashLoop('running-guitar')
  window.slopsmith?.on('pitch:detected', _onPitch)

  // Auto-finish after all beats + one beat of grace so the test never stalls.
  const autoMs = (GUITAR_BEATS * G_BEAT_SEC + G_BEAT_SEC) * 1000
  _guitarFinishTimer = setTimeout(() => {
    if (phase.value === 'running-guitar') _endGuitar()
  }, autoMs)
}

function _onPitch(event: Event): void {
  if (phase.value !== 'running-guitar') return
  const hz = (event as CustomEvent).detail?.hz ?? (event as any).hz
  if (!_isENote(hz)) return   // only accept E-string hits

  const now = performance.now()
  const idx = _nearestBeat(now, G_BEAT_SEC)
  if (idx < 0 || _beatSeen[idx]) return
  _beatSeen[idx] = true
  guitarOffsets.value.push(now - _audioPerfMs(_beatTimes[idx]))
  guitarCount.value++

  const midi = Math.round(69 + 12 * Math.log2(hz / 440))
  const N = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
  lastNote.value = N[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)

  if (guitarCount.value >= G_TAPS + G_WARMUP) _endGuitar()
}

function _endGuitar(): void {
  clearTimeout(_guitarFinishTimer ?? undefined); _guitarFinishTimer = null
  if (_rafId !== null) cancelAnimationFrame(_rafId); _rafId = null
  beatFlash.value = false
  _ctx?.close(); _ctx = null
  window.slopsmith?.off('pitch:detected', _onPitch)

  const valid = guitarOffsets.value.slice(G_WARMUP)
  if (valid.length < 1) {
    guitarCount.value = 0
    phase.value = 'audio-done'
    return
  }
  guitarMs.value = Math.round(_median(valid))
  phase.value    = 'done'
}

// ── Apply ─────────────────────────────────────────────────────────────────────

function applyAll() {
  if (audioMs.value !== null) player.setAvOffset(audioMs.value)
  if (inputMs.value !== null) {
    localStorage.setItem('pitch_yin.inputLatencyMs', String(Math.max(0, inputMs.value)))
  }
  emit('close')
}

function applyAudioOnly() {
  if (audioMs.value !== null) player.setAvOffset(audioMs.value)
  emit('close')
}

function reset(): void {
  clearTimeout(_guitarFinishTimer ?? undefined); _guitarFinishTimer = null
  if (_rafId !== null) cancelAnimationFrame(_rafId)
  window.slopsmith?.off('pitch:detected', _onPitch)
  _rafId = null; beatFlash.value = false
  _ctx?.close(); _ctx = null
  phase.value = 'idle'
}

onMounted(() => {
  if (props.guided) startAudioTest()
})

onUnmounted(() => {
  clearTimeout(_guitarFinishTimer ?? undefined)
  if (_rafId !== null) cancelAnimationFrame(_rafId)
  window.slopsmith?.off('pitch:detected', _onPitch)
  _ctx?.close()
})

// ── Helpers ───────────────────────────────────────────────────────────────────
const tapPct    = computed(() => Math.round(tapCount.value    / TOTAL_TAPS * 100))
const guitarPct = computed(() => Math.round(guitarCount.value / G_TAPS * 100))

const audioConsistency  = computed(() => _consistency(tapOffsets.value.slice(WARMUP)))
const guitarConsistency = computed(() => _consistency(guitarOffsets.value.slice(WARMUP)))

const micAvailable = computed(() => true)

// Expose localStorage values for the template (localStorage is not in Vue's template globals)
const storedInputLatency = computed(() => localStorage.getItem('pitch_yin.inputLatencyMs'))

function _sign(n) { return n > 0 ? '+' : '' }
</script>

<template>
  <div
    class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center"
    @click.self="emit('close')"
  >
    <div class="relative bg-dark-700 border border-white/[.07] rounded-2xl shadow-2xl w-[360px] p-5 flex flex-col gap-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-white">{{ $t('player.latency.title') }}</h2>
        <button class="player-btn" @click="emit('close')"><X :size="14" /></button>
      </div>

      <!-- ── IDLE ──────────────────────────────────────────────────────────── -->
      <template v-if="phase === 'idle'">
        <div class="flex flex-col gap-2.5 text-xs text-gray-400">
          <div class="flex gap-3 items-start">
            <span class="mt-0.5 shrink-0 text-accent font-semibold w-5 text-right">1</span>
            <div>
              <p class="font-medium text-gray-300">{{ $t('player.latency.audioLabel') }}</p>
              <p class="text-gray-500 mt-0.5">{{ $t('player.latency.audioDesc') }}</p>
            </div>
          </div>
          <div class="flex gap-3 items-start">
            <span class="mt-0.5 shrink-0 text-accent font-semibold w-5 text-right">2</span>
            <div>
              <p class="font-medium text-gray-300">{{ $t('player.latency.inputLabel') }}</p>
              <p class="text-gray-500 mt-0.5">{{ $t('player.latency.inputDesc') }}</p>
            </div>
          </div>
        </div>

        <div class="border-t border-white/[.04] pt-3 flex flex-col gap-1 text-[10px] text-gray-500">
          <span>{{ $t('player.latency.avOffset') }} <span :class="player.avOffsetMs !== 0 ? 'text-yellow-400' : 'text-gray-500'">{{ player.avOffsetMs > 0 ? '+' : '' }}{{ player.avOffsetMs }} ms</span></span>
          <span>{{ $t('player.latency.inputLatency') }} <span class="text-gray-400">{{ storedInputLatency ?? $t('player.latency.uncalibrated') }}{{ storedInputLatency != null ? ' ms' : '' }}</span></span>
        </div>

        <button
          class="w-full py-2.5 rounded-lg bg-accent hover:bg-accent/80 text-white text-sm font-semibold transition-colors"
          @click="startAudioTest"
        >
          {{ $t('player.latency.startTap') }}
        </button>
      </template>

      <!-- ── COUNTDOWN ─────────────────────────────────────────────────────── -->
      <template v-else-if="phase === 'counting' || phase === 'counting2'">
        <div class="flex flex-col items-center gap-2 py-6">
          <p class="text-xs text-gray-400">
            {{ phase === 'counting2' ? $t('player.latency.countdownGuitar') : $t('player.latency.countdownTap') }}
          </p>
          <span class="text-7xl font-black tabular-nums text-white">{{ countdown }}</span>
        </div>
      </template>

      <!-- ── RUNNING AUDIO ──────────────────────────────────────────────────── -->
      <template v-else-if="phase === 'running-audio'">
        <p class="text-xs text-gray-400 text-center">{{ $t('player.latency.tapInstruction') }}</p>

        <div class="flex justify-center">
          <div class="w-16 h-16 rounded-full transition-all duration-75"
               :class="beatFlash ? 'bg-accent shadow-[0_0_24px_4px_rgba(64,128,224,0.7)]' : 'bg-dark-600'" />
        </div>

        <button
          class="w-full py-5 rounded-xl text-white font-bold text-base select-none active:scale-95 transition-transform"
          :class="beatFlash ? 'bg-accent' : 'bg-dark-600 hover:bg-dark-500'"
          @click="tap" @touchstart.prevent="tap"
        >
          <MousePointer2 :size="18" class="inline-block mr-1.5 -mt-0.5" /> {{ $t('player.latency.tap') }}
        </button>

        <div class="flex flex-col gap-1">
          <div class="h-1.5 bg-dark-600 rounded-full overflow-hidden">
            <div class="h-full bg-accent rounded-full transition-all duration-200" :style="{ width: tapPct + '%' }" />
          </div>
          <span class="text-[10px] text-gray-500 text-right tabular-nums">{{ tapCount }} / {{ TOTAL_TAPS }}</span>
        </div>

        <button class="text-xs text-gray-500 hover:text-gray-300 text-center" @click="reset">{{ $t('common.cancel') }}</button>
      </template>

      <!-- ── AUDIO DONE ─────────────────────────────────────────────────────── -->
      <template v-else-if="phase === 'audio-done'">
        <!-- Phase 1 result -->
        <div class="flex items-center justify-between rounded-lg bg-dark-600 px-3 py-2.5">
          <div>
            <p class="text-[10px] text-gray-500">{{ $t('player.latency.audioLabel') }}</p>
            <p class="text-xl font-black tabular-nums" :class="audioMs !== 0 ? 'text-yellow-400' : 'text-green-400'">
              {{ _sign(audioMs) }}{{ audioMs }} ms
            </p>
          </div>
          <span class="text-[10px]"
            :class="audioConsistency === 'good' ? 'text-green-500' : audioConsistency === 'fair' ? 'text-yellow-500' : 'text-red-400'">
            {{ audioConsistency }}
          </span>
        </div>

        <div v-if="micAvailable" class="flex flex-col gap-2">
          <p class="text-xs text-gray-400">
            {{ $t('player.latency.guitarInstruction') }}
          </p>
          <button
            class="w-full py-2.5 rounded-lg bg-accent hover:bg-accent/80 text-white text-sm font-semibold transition-colors"
            @click="startGuitarTest"
          >
            <Mic :size="13" class="inline-block mr-1.5 -mt-0.5" /> {{ $t('player.latency.startGuitar') }}
          </button>
        </div>
        <div v-else class="text-xs text-yellow-600/80">
          {{ $t('player.latency.micUnavailable') }}
        </div>

        <button
          v-if="!guided"
          class="text-xs text-gray-500 hover:text-gray-300 text-center"
          @click="applyAudioOnly"
        >
          {{ $t('player.latency.skipGuitar') }}
        </button>
      </template>

      <!-- ── RUNNING GUITAR ─────────────────────────────────────────────────── -->
      <template v-else-if="phase === 'running-guitar'">
        <p class="text-xs text-gray-400 text-center">{{ $t('player.latency.guitarInstruction') }}</p>

        <!-- Beat flash + big E label -->
        <div class="flex items-center justify-center gap-4">
          <div class="w-14 h-14 rounded-full transition-all duration-75 flex items-center justify-center shrink-0"
               :class="beatFlash ? 'bg-accent shadow-[0_0_24px_4px_rgba(64,128,224,0.7)]' : 'bg-dark-600'" />
          <div class="flex flex-col items-center">
            <span class="text-5xl font-black leading-none"
                  :class="lastNote ? 'text-green-400' : 'text-gray-700'">
              {{ lastNote ? lastNote : 'E' }}
            </span>
            <span class="text-[10px] mt-1"
                  :class="lastNote ? 'text-green-500' : 'text-gray-600'">
              {{ lastNote ? $t('player.latency.detected') : $t('player.latency.waiting') }}
            </span>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <div class="h-1.5 bg-dark-600 rounded-full overflow-hidden">
            <div class="h-full bg-green-500 rounded-full transition-all duration-200"
                 :style="{ width: Math.min(guitarPct, 100) + '%' }" />
          </div>
          <span class="text-[10px] text-gray-500 text-right tabular-nums">
            {{ Math.min(guitarCount, G_TAPS) }} / {{ G_TAPS }}
          </span>
        </div>

        <button class="text-xs text-gray-500 hover:text-gray-300 text-center" @click="reset">{{ $t('common.cancel') }}</button>
      </template>

      <!-- ── DONE ───────────────────────────────────────────────────────────── -->
      <template v-else-if="phase === 'done'">
        <!-- Results breakdown -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between rounded-lg bg-dark-600 px-3 py-2">
            <div>
              <p class="text-[10px] text-gray-500">{{ $t('player.latency.resultAudio') }}</p>
              <p class="text-sm font-bold tabular-nums text-yellow-400">{{ _sign(audioMs) }}{{ audioMs }} ms</p>
            </div>
            <p class="text-[10px] text-gray-500">{{ $t('player.latency.resultAvTarget') }}</p>
          </div>
          <div class="flex items-center justify-between rounded-lg bg-dark-600 px-3 py-2">
            <div>
              <p class="text-[10px] text-gray-500">{{ $t('player.latency.resultInput') }}</p>
              <p class="text-sm font-bold tabular-nums"
                 :class="inputMs !== null && inputMs < 0 ? 'text-red-400' : 'text-green-400'">
                {{ inputMs !== null ? inputMs : '?' }} ms
              </p>
            </div>
            <p class="text-[10px] text-gray-500">{{ $t('player.latency.resultHitTarget') }}</p>
          </div>

          <p v-if="inputMs !== null && inputMs < 0" class="text-[10px] text-red-400 px-1">
            {{ $t('player.latency.negativeWarning') }}
          </p>
          <p v-if="guitarConsistency === 'poor — retry'" class="text-[10px] text-red-400 px-1">
            {{ $t('player.latency.poorConsistency') }}
          </p>
        </div>

        <div class="flex gap-2">
          <button
            class="flex-1 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-gray-300 text-xs font-semibold transition-colors"
            @click="reset"
          >
            {{ $t('player.latency.retry') }}
          </button>
          <button
            class="flex-1 py-2 rounded-lg bg-accent hover:bg-accent/80 text-white text-xs font-semibold transition-colors"
            :disabled="inputMs !== null && inputMs < 0"
            @click="applyAll"
          >
            {{ $t('player.latency.applyBoth') }}
          </button>
        </div>
      </template>

    </div>
  </div>
</template>
