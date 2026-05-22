<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { loadWasm, start as pitchStart, stop as pitchStop, setMonitorVolume, isRunning as isPitchRunning } from '@/services/pitchDetection'

const LS_DEVICE   = 'pitch_yin.deviceId'
const LS_CLARITY  = 'pitch_yin.clarityThreshold'
const LS_MONITOR  = 'pitch_yin.monitorVolume'
const WINDOW_SIZE = 4096

const NOTE_NAMES = ['A','A♯','B','C','C♯','D','D♯','E','F','F♯','G','G♯']

const micDevices   = ref<MediaDeviceInfo[]>([])
const selectedMic  = ref(localStorage.getItem(LS_DEVICE) || '')
const micError     = ref('')
const testing      = ref(false)
const testBtnLabel = ref('Test mic')

const clarityVal = ref(parseFloat(localStorage.getItem(LS_CLARITY)) || 0.80)
const monitorVal = ref(parseFloat(localStorage.getItem(LS_MONITOR)) || 0)

const canvasRef = ref<HTMLCanvasElement | null>(null)

let _mod: any = null
let _audioCtx: AudioContext | null = null
let _stream: MediaStream | null = null
let _processor: ScriptProcessorNode | null = null
let _source: MediaStreamAudioSourceNode | null = null
let _rafId: number | null = null
let _frame = { hz: 0, clarity: 0, vu: 0, active: false }

function hzToNote(hz: number) {
  if (hz <= 0) return null
  const semis   = 12 * Math.log2(hz / 440)
  const rounded = Math.round(semis)
  const cents   = (semis - rounded) * 100
  const idx     = ((rounded % 12) + 12) % 12
  const octave  = 4 + Math.floor((rounded + 9) / 12)
  return { name: NOTE_NAMES[idx], octave, cents }
}

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
    ctx.fillText('Start test to see live pitch', W / 2, H * 0.58)
    drawBars(ctx, W, H, 0, 0, 0, false)
    return
  }

  const { hz, clarity, vu } = _frame
  const note = hzToNote(hz)
  const cents = note ? Math.max(-50, Math.min(50, note.cents)) : 0
  const absC = Math.abs(cents)
  const color = !note ? '#374151' : absC < 5 ? '#22c55e' : absC < 20 ? '#e8c040' : '#ef4444'

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

function drawBars(ctx: CanvasRenderingContext2D, W: number, H: number, cents: number, clarity: number, vu: number, hasNote: boolean) {
  const bx = 24, bw = W - 48
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
  ctx.beginPath()
  ctx.moveTo(cx, centsY - 5)
  ctx.lineTo(cx, centsY + 15)
  ctx.stroke()

  if (hasNote) {
    const nx = cx + (cents / 50) * (bw / 2)
    const absC = Math.abs(cents)
    const nc = absC < 5 ? '#22c55e' : absC < 20 ? '#e8c040' : '#ef4444'
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
  ctx.textAlign = 'left';    ctx.fillText('−50', bx, centsY + 13)
  ctx.textAlign = 'center';  ctx.fillText('0',   cx,      centsY + 13)
  ctx.textAlign = 'right';   ctx.fillText('+50', bx + bw, centsY + 13)

  const clY = Math.round(H * 0.84)
  ctx.fillStyle = '#1a1f2e'
  ctx.fillRect(bx, clY, bw, 5)
  ctx.fillStyle = '#4080e0'
  ctx.fillRect(bx, clY, bw * Math.max(0, clarity), 5)
  ctx.font = '9px system-ui,sans-serif'
  ctx.fillStyle = '#4b5563'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`clarity ${Math.round(clarity * 100)}%`, bx + bw, clY - 1)

  const vuY = Math.round(H * 0.94)
  ctx.fillStyle = '#1a1f2e'
  ctx.fillRect(bx, vuY, bw, 4)
  const vuNorm = Math.min(1, vu * 6)
  const vuColor = vuNorm > 0.85 ? '#ef4444' : vuNorm > 0.5 ? '#e8c040' : '#22c55e'
  ctx.fillStyle = vuColor
  ctx.fillRect(bx, vuY, bw * vuNorm, 4)
  ctx.font = '9px system-ui,sans-serif'
  ctx.fillStyle = '#4b5563'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText('mic', bx, vuY - 1)
}

function drawLoop() {
  _rafId = requestAnimationFrame(drawLoop)
  drawCanvas()
}

function stopDrawLoop() {
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null }
  drawCanvas()
}

function rms(buf: Float32Array) {
  let s = 0
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / buf.length)
}

async function toggleTest() {
  if (testing.value) { stopTest(); return }
  await startTest()
}

async function startTest() {
  micError.value = ''

  try {
    _mod = await loadWasm()
    if (!_mod) throw new Error('pitch_yin module not ready — reload the page')
  } catch (e: any) {
    micError.value = e.message
    return
  }

  const deviceId = selectedMic.value || undefined
  const constraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl:  false,
      ...(deviceId && { deviceId: { exact: deviceId } }),
    } as any,
  }

  try {
    _audioCtx = new AudioContext()
    _stream = await navigator.mediaDevices.getUserMedia(constraints)
  } catch (e: any) {
    micError.value = 'Microphone access denied: ' + e.message
    _audioCtx?.close()
    _audioCtx = null
    return
  }

  _mod._pitch_init(_audioCtx.sampleRate)
  const inputPtr = _mod._pitch_input_ptr()

  _source = _audioCtx.createMediaStreamSource(_stream)
  _processor = _audioCtx.createScriptProcessor(WINDOW_SIZE, 1, 1)

  _processor.onaudioprocess = (ev: AudioProcessingEvent) => {
    const samples = ev.inputBuffer.getChannelData(0)
    _mod.HEAPF32.set(samples, inputPtr >> 2)
    _mod._pitch_process()
    const hz = _mod._pitch_get_hz()
    const clarity = _mod._pitch_get_clarity()
    _frame = { hz, clarity, vu: rms(samples), active: true }
  }

  _source.connect(_processor)
  _processor.connect(_audioCtx.destination)

  testing.value = true
  testBtnLabel.value = 'Stop'
  drawLoop()
}

function stopTest() {
  testing.value = false
  _frame = { hz: 0, clarity: 0, vu: 0, active: false }
  _processor?.disconnect()
  _source?.disconnect()
  _stream?.getTracks().forEach(t => t.stop())
  _audioCtx?.close()
  _audioCtx = _processor = _source = _stream as any
  testBtnLabel.value = 'Test mic'
  stopDrawLoop()
}

async function enumerateMics() {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true })
    tmp.getTracks().forEach(t => t.stop())
  } catch { /* no permission */ }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    micDevices.value = devices.filter(d => d.kind === 'audioinput')
  } catch (e: any) {
    micError.value = 'Cannot enumerate devices: ' + e.message
  }
}

function selectMic(deviceId: string) {
  selectedMic.value = deviceId
  if (deviceId) localStorage.setItem(LS_DEVICE, deviceId)
  else localStorage.removeItem(LS_DEVICE)
  if (testing.value) { stopTest(); startTest() }
  if (isPitchRunning()) {
    pitchStop()
    pitchStart()
  }
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

onMounted(() => {
  enumerateMics()
  drawCanvas()
})

onUnmounted(() => {
  if (testing.value) stopTest()
})
</script>

<template>
  <section class="settings-section">
    <h2 class="text-sm font-semibold text-gray-200 mb-3">Audio</h2>

    <!-- Microphone selector -->
    <div class="mb-4">
      <label class="settings-label">Microphone</label>
      <div class="flex items-center gap-2">
        <select
          class="settings-input flex-1"
          :value="selectedMic"
          @change="selectMic(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Default microphone</option>
          <option
            v-for="d in micDevices"
            :key="d.deviceId"
            :value="d.deviceId"
          >{{ d.label || `Microphone (${d.deviceId.slice(0, 8)}…)` }}</option>
        </select>
        <button
          class="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition"
          @click="enumerateMics"
        >Refresh</button>
      </div>
      <p v-if="micError" class="text-xs text-red-400 mt-1">{{ micError }}</p>
    </div>

    <!-- Live tuner preview -->
    <div class="mb-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-medium text-gray-400">Live preview</span>
        <button
          class="text-xs px-3 py-1 rounded transition"
          :class="testing
            ? 'bg-red-900/40 border border-red-700/60 text-red-300'
            : 'bg-dark-600 border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-gray-100'"
          @click="toggleTest"
        >{{ testBtnLabel }}</button>
      </div>
      <canvas
        ref="canvasRef"
        width="400"
        height="180"
        class="w-full rounded-lg border border-gray-800 block"
        style="height: auto; background: #0d1117"
      ></canvas>
    </div>

    <!-- Clarity threshold -->
    <div class="mb-4">
      <label class="settings-label flex justify-between">
        <span>Clarity threshold</span>
        <span class="text-gray-300">{{ clarityVal.toFixed(2) }}</span>
      </label>
      <input
        type="range"
        min="0.50"
        max="0.97"
        step="0.01"
        class="w-full accent-accent"
        :value="clarityVal"
        @input="setClarity(($event.target as HTMLInputElement).value)"
      >
      <p class="text-[10px] text-gray-500 mt-1">
        Lower = more detections (including uncertain ones).
        Higher = only very clean pitches get through.
      </p>
    </div>

    <!-- Monitor volume -->
    <div>
      <label class="settings-label flex justify-between">
        <span>Monitor volume</span>
        <span class="text-gray-300">{{ monitorVal.toFixed(2) }}</span>
      </label>
      <input
        type="range"
        min="0"
        max="2"
        step="0.05"
        class="w-full accent-accent"
        :value="monitorVal"
        @input="setMonitor(($event.target as HTMLInputElement).value)"
      >
      <p class="text-[10px] text-gray-500 mt-1">
        Passes the raw mic signal through to your speakers so you can hear yourself play.
        Starts at 0 to avoid feedback — raise it only when using headphones.
        Also adjustable in the player's Mixer popover while playing.
      </p>
      <p class="text-[10px] text-yellow-400/70 mt-1">
        ⚠ Raise above 0 only when using headphones — speakers will cause feedback.
      </p>
    </div>
  </section>
</template>
