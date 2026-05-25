<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { loadWasm, start as pitchStart, stop as pitchStop, setMonitorVolume, isRunning as isPitchRunning } from '@/features/player/services/pitchDetection'

const { t } = useI18n()

const LS_DEVICE   = 'pitch_yin.deviceId'
const LS_CLARITY  = 'pitch_yin.clarityThreshold'
const LS_MONITOR  = 'pitch_yin.monitorVolume'
const WINDOW_SIZE = 4096

const NOTE_NAMES = ['A','A♯','B','C','C♯','D','D♯','E','F','F♯','G','G♯']

// ── State ──────────────────────────────────────────────────────────────────────
const micDevices   = ref<MediaDeviceInfo[]>([])
const selectedMic  = ref(localStorage.getItem(LS_DEVICE) || '')
const micError     = ref('')
const testing      = ref(false)

const clarityVal = ref(parseFloat(localStorage.getItem(LS_CLARITY) ?? '') || 0.80)
const monitorVal = ref(parseFloat(localStorage.getItem(LS_MONITOR) ?? '') || 0)

const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── Private audio handles ──────────────────────────────────────────────────────
interface PitchMod {
  _pitch_init(sampleRate: number): void
  _pitch_input_ptr(): number
  _pitch_process(): void
  _pitch_get_hz(): number
  _pitch_get_clarity(): number
  HEAPF32: Float32Array
}
let _mod: PitchMod | null = null
let _audioCtx:  AudioContext | null = null
let _stream:    MediaStream | null = null
let _processor: ScriptProcessorNode | null = null
let _source:    MediaStreamAudioSourceNode | null = null
let _rafId:     number | null = null
let _frame = { hz: 0, clarity: 0, vu: 0, active: false }

// ── Note helpers ───────────────────────────────────────────────────────────────
function hzToNote(hz: number) {
  if (hz <= 0) return null
  const semis   = 12 * Math.log2(hz / 440)
  const rounded = Math.round(semis)
  const cents   = (semis - rounded) * 100
  const idx     = ((rounded % 12) + 12) % 12
  const octave  = 4 + Math.floor((rounded + 9) / 12)
  return { name: NOTE_NAMES[idx], octave, cents }
}

function rms(buf: Float32Array) {
  let s = 0
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / buf.length)
}

// ── Canvas drawing ─────────────────────────────────────────────────────────────
function drawCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width, H = canvas.height

  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, W, H)

  if (!_frame.active) {
    ctx.fillStyle = '#1f2937'
    ctx.font = 'bold 56px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('—', W / 2, H * 0.30)
    ctx.font = '11px system-ui,sans-serif'
    ctx.fillStyle = '#374151'
    ctx.fillText(t('settings.audio.startPrompt'), W / 2, H * 0.58)
    drawBars(ctx, W, H, 0, 0, 0, false)
    return
  }

  const { hz, clarity, vu } = _frame
  const note  = hzToNote(hz)
  const cents  = note ? Math.max(-50, Math.min(50, note.cents)) : 0
  const absC   = Math.abs(cents)
  const color  = !note ? '#374151' : absC < 5 ? '#22c55e' : absC < 20 ? '#e8c040' : '#ef4444'

  ctx.font = 'bold 56px system-ui,sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color

  if (note) {
    const nameW = ctx.measureText(note.name).width
    ctx.fillText(note.name, W / 2 - 10, H * 0.28)
    ctx.font = 'bold 26px system-ui,sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(String(note.octave), W / 2 - 10 + nameW / 2 + 3, H * 0.10)
  } else {
    ctx.fillText('—', W / 2, H * 0.28)
  }

  ctx.font = '12px system-ui,sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#6b7280'
  ctx.fillText(note ? `${hz.toFixed(1)} Hz` : '', W / 2, H * 0.52)

  drawBars(ctx, W, H, cents, clarity, vu, !!note)
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  cents: number, clarity: number, vu: number, hasNote: boolean,
) {
  const bx = 24, bw = W - 48

  // ── Cents bar ──
  const centsY = Math.round(H * 0.635)
  ctx.fillStyle = '#1a1f2e'
  ctx.fillRect(bx, centsY, bw, 10)

  const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0)
  grad.addColorStop(0,    '#ef444466')
  grad.addColorStop(0.25, '#e8c04066')
  grad.addColorStop(0.42, '#22c55e66')
  grad.addColorStop(0.58, '#22c55e66')
  grad.addColorStop(0.75, '#e8c04066')
  grad.addColorStop(1,    '#ef444466')
  ctx.fillStyle = grad
  ctx.fillRect(bx, centsY, bw, 10)

  const cx = bx + bw / 2
  ctx.strokeStyle = '#4b5563'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx, centsY - 5); ctx.lineTo(cx, centsY + 15); ctx.stroke()

  if (hasNote) {
    const nx   = cx + (cents / 50) * (bw / 2)
    const absC = Math.abs(cents)
    const nc   = absC < 5 ? '#22c55e' : absC < 20 ? '#e8c040' : '#ef4444'
    ctx.fillStyle = nc
    ctx.beginPath()
    ctx.moveTo(nx - 5, centsY - 8)
    ctx.lineTo(nx + 5, centsY - 8)
    ctx.lineTo(nx,     centsY - 1)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(nx - 2, centsY, 4, 10)
  }

  ctx.font = '9px system-ui,sans-serif'
  ctx.fillStyle = '#4b5563'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left';   ctx.fillText('−50', bx, centsY + 13)
  ctx.textAlign = 'center'; ctx.fillText('0',   cx,      centsY + 13)
  ctx.textAlign = 'right';  ctx.fillText('+50', bx + bw, centsY + 13)

  // ── Clarity bar ──
  const clY = Math.round(H * 0.84)
  ctx.fillStyle = '#1a1f2e'; ctx.fillRect(bx, clY, bw, 5)
  ctx.fillStyle = '#4080e0'; ctx.fillRect(bx, clY, bw * Math.max(0, clarity), 5)
  ctx.font = '9px system-ui,sans-serif'
  ctx.fillStyle = '#4b5563'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
  ctx.fillText(`clarity ${Math.round(clarity * 100)}%`, bx + bw, clY - 1)

  // ── VU bar ──
  const vuY    = Math.round(H * 0.94)
  const vuNorm = Math.min(1, vu * 6)
  const vuColor = vuNorm > 0.85 ? '#ef4444' : vuNorm > 0.5 ? '#e8c040' : '#22c55e'
  ctx.fillStyle = '#1a1f2e';  ctx.fillRect(bx, vuY, bw, 4)
  ctx.fillStyle = vuColor;    ctx.fillRect(bx, vuY, bw * vuNorm, 4)
  ctx.font = '9px system-ui,sans-serif'
  ctx.fillStyle = '#4b5563'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
  ctx.fillText('mic', bx, vuY - 1)
}

function drawLoop()    { _rafId = requestAnimationFrame(drawLoop); drawCanvas() }
function stopDrawLoop() { if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null } drawCanvas() }

// ── Mic test ───────────────────────────────────────────────────────────────────
async function toggleTest() { testing.value ? stopTest() : await startTest() }

async function startTest() {
  micError.value = ''
  try {
    _mod = await loadWasm() as PitchMod
    if (!_mod) throw new Error('pitch_yin module not ready — reload the page')
  } catch (e: unknown) {
    micError.value = (e as Error).message
    return
  }

  const deviceId = selectedMic.value || undefined
  try {
    _audioCtx = new AudioContext()
    _stream   = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl:  false,
        ...(deviceId && { deviceId: { exact: deviceId } }),
      },
    })
  } catch (e: unknown) {
    micError.value = 'Microphone access denied: ' + (e as Error).message
    _audioCtx?.close(); _audioCtx = null
    return
  }

  _mod._pitch_init(_audioCtx.sampleRate)
  const inputPtr = _mod._pitch_input_ptr()

  _source    = _audioCtx.createMediaStreamSource(_stream)
  _processor = _audioCtx.createScriptProcessor(WINDOW_SIZE, 1, 1)

  _processor.onaudioprocess = (ev: AudioProcessingEvent) => {
    const samples = ev.inputBuffer.getChannelData(0)
    _mod!.HEAPF32.set(samples, inputPtr >> 2)
    _mod!._pitch_process()
    _frame = { hz: _mod!._pitch_get_hz(), clarity: _mod!._pitch_get_clarity(), vu: rms(samples), active: true }
  }

  _source.connect(_processor)
  _processor.connect(_audioCtx.destination)
  testing.value = true
  drawLoop()
}

function stopTest() {
  testing.value = false
  _frame = { hz: 0, clarity: 0, vu: 0, active: false }
  _processor?.disconnect(); _source?.disconnect()
  _stream?.getTracks().forEach(tr => tr.stop())
  _audioCtx?.close()
  _audioCtx = null; _processor = null; _source = null; _stream = null
  stopDrawLoop()
}

// ── Device enumeration ─────────────────────────────────────────────────────────
async function enumerateMics() {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true })
    tmp.getTracks().forEach(tr => tr.stop())
  } catch { /* permission not granted yet */ }
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    micDevices.value = all.filter(d => d.kind === 'audioinput')
  } catch (e: unknown) {
    micError.value = 'Cannot enumerate devices: ' + (e as Error).message
  }
}

function selectMic(deviceId: string) {
  selectedMic.value = deviceId
  if (deviceId) localStorage.setItem(LS_DEVICE, deviceId)
  else localStorage.removeItem(LS_DEVICE)
  if (testing.value) { stopTest(); startTest() }
  if (isPitchRunning()) { pitchStop(); pitchStart() }
}

function setClarity(v: string) {
  clarityVal.value = parseFloat(v)
  localStorage.setItem(LS_CLARITY, v)
}

function setMonitor(v: string) {
  const val = parseFloat(v)
  monitorVal.value = val
  setMonitorVolume(val)
}

onMounted(() => { enumerateMics(); drawCanvas() })
onUnmounted(() => { if (testing.value) stopTest() })
</script>

<template>
  <div class="space-y-4">

    <!-- ── Input device ──────────────────────────────────────────────────── -->
    <section class="settings-card">
      <div class="section-header">
        <svg class="section-icon" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
        <div>
          <h2 class="section-title">Input device</h2>
          <p class="section-desc">Select the microphone used for pitch detection.</p>
        </div>
      </div>

      <div class="flex items-center gap-2 mt-4">
        <select
          class="settings-input flex-1"
          :value="selectedMic"
          @change="selectMic(($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ $t('settings.audio.micDefault') }}</option>
          <option v-for="d in micDevices" :key="d.deviceId" :value="d.deviceId">
            {{ d.label || `Microphone (${d.deviceId.slice(0, 8)}…)` }}
          </option>
        </select>
        <button class="btn-ghost" @click="enumerateMics">
          {{ $t('settings.audio.micRefresh') }}
        </button>
      </div>

      <p v-if="micError" class="text-xs text-red-400 mt-2">{{ micError }}</p>
    </section>

    <!-- ── Live tuner ────────────────────────────────────────────────────── -->
    <section class="settings-card">
      <div class="section-header">
        <svg class="section-icon" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        <div>
          <h2 class="section-title">Live tuner</h2>
          <p class="section-desc">Visualise real-time pitch from your microphone.</p>
        </div>
        <button
          class="ml-auto text-xs px-3 py-1.5 rounded-lg border transition"
          :class="testing
            ? 'bg-red-900/30 border-red-700/50 text-red-300 hover:bg-red-900/50'
            : 'bg-dark-600 border-dark-500 text-gray-300 hover:border-gray-500 hover:text-gray-100'"
          @click="toggleTest"
        >
          {{ testing ? $t('settings.audio.stop') : $t('settings.audio.testMic') }}
        </button>
      </div>

      <canvas
        ref="canvasRef"
        width="400"
        height="180"
        class="w-full rounded-xl border border-white/[.06] mt-4 block"
        style="background: #0d1117"
      />
    </section>

    <!-- ── Detection sensitivity ─────────────────────────────────────────── -->
    <section class="settings-card">
      <div class="section-header">
        <svg class="section-icon" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
        <div>
          <h2 class="section-title">Detection sensitivity</h2>
          <p class="section-desc">Higher clarity = fewer false notes. Lower = more responsive in noisy environments.</p>
        </div>
      </div>

      <div class="mt-4 space-y-2">
        <div class="flex justify-between text-xs text-gray-400">
          <span>{{ $t('settings.audio.clarityLabel') }}</span>
          <span class="tabular-nums font-medium text-gray-200">{{ clarityVal.toFixed(2) }}</span>
        </div>
        <input
          type="range" min="0.50" max="0.97" step="0.01"
          class="w-full accent-accent"
          :value="clarityVal"
          @input="setClarity(($event.target as HTMLInputElement).value)"
        />
        <div class="flex justify-between text-[10px] text-gray-600">
          <span>More responsive</span>
          <span>More accurate</span>
        </div>
      </div>
    </section>

    <!-- ── Monitor mix ────────────────────────────────────────────────────── -->
    <section class="settings-card">
      <div class="section-header">
        <svg class="section-icon" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
        </svg>
        <div>
          <h2 class="section-title">Monitor mix</h2>
          <p class="section-desc">Blend your mic input back into the output so you can hear yourself play.</p>
        </div>
      </div>

      <div class="mt-4 space-y-2">
        <div class="flex justify-between text-xs text-gray-400">
          <span>{{ $t('settings.audio.monitorLabel') }}</span>
          <span class="tabular-nums font-medium text-gray-200">{{ monitorVal.toFixed(2) }}</span>
        </div>
        <input
          type="range" min="0" max="2" step="0.05"
          class="w-full accent-accent"
          :value="monitorVal"
          @input="setMonitor(($event.target as HTMLInputElement).value)"
        />
        <div class="flex justify-between text-[10px] text-gray-600">
          <span>Off</span>
          <span>2×</span>
        </div>
      </div>

      <p v-if="monitorVal > 0" class="mt-3 text-[11px] text-yellow-400/70 leading-relaxed">
        {{ $t('settings.audio.monitorWarning') }}
      </p>
    </section>

  </div>
</template>

<style scoped>
.settings-card {
  background: theme('colors.dark.700');
  border: 1px solid theme('colors.white / 0.06');
  border-radius: 0.875rem;
  padding: 1.25rem;
}

.section-header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.section-icon {
  width: 1.125rem;
  height: 1.125rem;
  color: theme('colors.gray.400');
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: theme('colors.gray.100');
  line-height: 1.25;
}

.section-desc {
  font-size: 0.75rem;
  color: theme('colors.gray.500');
  margin-top: 0.125rem;
  line-height: 1.4;
}

.settings-input {
  background: theme('colors.dark.800');
  border: 1px solid theme('colors.dark.500');
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: white;
  font-size: 0.8125rem;
  outline: none;
  transition: border-color 0.15s;
}
.settings-input:focus { border-color: theme('colors.accent.DEFAULT', '#4080e0'); }

.btn-ghost {
  font-size: 0.6875rem;
  color: theme('colors.gray.500');
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  border: 1px solid theme('colors.dark.500');
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}
.btn-ghost:hover {
  color: theme('colors.gray.300');
  border-color: theme('colors.gray.600');
}
</style>
