<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

// ── Mode: 0=hidden  1=fps-only  2=full ───────────────────────────────────────

const MODE_KEY    = 'debugOverlayMode'
const mode        = ref(parseInt(localStorage.getItem(MODE_KEY) ?? '2', 10))
const modeNextLbl = computed(() => ['FPS', 'FULL', 'HIDE'][mode.value])

function cycleMode(): void {
  mode.value = (mode.value + 1) % 3
  localStorage.setItem(MODE_KEY, String(mode.value))
}

// ── Shared ────────────────────────────────────────────────────────────────────

const SAMPLES    = 80
const BAR_MAX_MS = 4

// ── Generic line-graph drawer ─────────────────────────────────────────────────

function _drawLineGraph(
  canvas: HTMLCanvasElement,
  history: number[],
  opts: {
    min?: number
    max: number
    refLines?: Array<{ value: number; color: string }>
    colorFn: (v: number) => string
    fillColor?: string
  },
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx || history.length < 2) return
  const { width: w, height: h } = canvas
  const { min = 0, max, refLines = [], colorFn, fillColor } = opts
  const range = max - min || 1
  const toY = (v: number) => h - ((Math.min(Math.max(v, min), max) - min) / range) * h

  ctx.clearRect(0, 0, w, h)
  ctx.lineWidth = 1
  ctx.setLineDash([2, 3])
  for (const ref of refLines) {
    ctx.strokeStyle = ref.color
    const y = toY(ref.value)
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }
  ctx.setLineDash([])

  if (fillColor) {
    ctx.beginPath()
    history.forEach((v, i) => {
      const x = (i / (SAMPLES - 1)) * w
      i === 0 ? ctx.moveTo(x, toY(v)) : ctx.lineTo(x, toY(v))
    })
    ctx.lineTo((history.length - 1) / (SAMPLES - 1) * w, h)
    ctx.lineTo(0, h); ctx.closePath()
    ctx.fillStyle = fillColor; ctx.fill()
  }

  ctx.lineWidth = 1.5
  for (let i = 1; i < history.length; i++) {
    ctx.strokeStyle = colorFn(history[i])
    ctx.beginPath()
    ctx.moveTo(((i - 1) / (SAMPLES - 1)) * w, toY(history[i - 1]))
    ctx.lineTo((i       / (SAMPLES - 1)) * w, toY(history[i]))
    ctx.stroke()
  }
}

// ── FPS ───────────────────────────────────────────────────────────────────────

const fpsCanvas  = ref<HTMLCanvasElement | null>(null)
const currentFps = ref(0)
const fpsHistory: number[] = []

function _drawFps() {
  if (fpsCanvas.value) _drawLineGraph(fpsCanvas.value, fpsHistory, {
    max: 120,
    refLines: [{ value: 60, color: 'rgba(255,255,100,0.2)' }],
    colorFn: v => v < 30 ? '#f87171' : v < 50 ? '#fbbf24' : '#4ade80',
    fillColor: 'rgba(74,222,128,0.07)',
  })
}

// ── Frame time ────────────────────────────────────────────────────────────────

const ftCanvas      = ref<HTMLCanvasElement | null>(null)
const currentFtMs   = ref(0)
const ftHistory: number[] = []
let   _maxFtInWindow = 0

function _drawFt() {
  if (ftCanvas.value) _drawLineGraph(ftCanvas.value, ftHistory, {
    max: 50,
    refLines: [
      { value: 16.7, color: 'rgba(255,255,100,0.20)' },
      { value: 33.3, color: 'rgba(248,113,113,0.15)' },
    ],
    colorFn: v => v >= 33 ? '#f87171' : v >= 16.7 ? '#fbbf24' : '#4ade80',
    fillColor: 'rgba(251,191,36,0.06)',
  })
}

// ── JS Heap ───────────────────────────────────────────────────────────────────

const heapCanvas   = ref<HTMLCanvasElement | null>(null)
const currentHeap  = ref(-1)
const heapHistory: number[] = []
let   _heapMax = 10

function _drawHeap() {
  if (heapCanvas.value) _drawLineGraph(heapCanvas.value, heapHistory, {
    max: Math.max(_heapMax * 1.2, 10),
    colorFn: v => v > _heapMax * 0.8 ? '#f87171' : v > _heapMax * 0.6 ? '#fbbf24' : '#60a5fa',
    fillColor: 'rgba(96,165,250,0.07)',
  })
}

// ── A/V drift ─────────────────────────────────────────────────────────────────

const driftCanvas  = ref<HTMLCanvasElement | null>(null)
const currentDrift = ref(0)
const driftHistory: number[] = []

function _drawDrift() {
  if (driftCanvas.value) _drawLineGraph(driftCanvas.value, driftHistory, {
    min: -50, max: 50,
    refLines: [{ value: 0, color: 'rgba(255,255,255,0.12)' }],
    colorFn: v => Math.abs(v) >= 30 ? '#f87171' : Math.abs(v) >= 15 ? '#fbbf24' : '#34d399',
  })
}

// ── usePlayer perf breakdown ──────────────────────────────────────────────────

interface PerfBreakdown { scorer: number; store: number; bundle: number; total: number }
const perfBreakdown = ref<PerfBreakdown | null>(null)

const perfRows = computed(() => {
  const pb = perfBreakdown.value
  if (!pb) return []
  const pct = (ms: number) => Math.min((ms / BAR_MAX_MS) * 100, 100)
  return [
    { label: 'tick',   ms: pb.scorer.toFixed(2), pct: pct(pb.scorer), color: '#4ade80' },
    { label: 'store',  ms: pb.store.toFixed(2),  pct: pct(pb.store),  color: '#60a5fa' },
    { label: 'bundle', ms: pb.bundle.toFixed(2), pct: pct(pb.bundle), color: '#a78bfa' },
    { label: 'total',  ms: pb.total.toFixed(2),  pct: pct(pb.total),  color: pb.total > 2 ? '#fbbf24' : '#94a3b8' },
  ]
})

// ── Hit accuracy + note timeline graph ───────────────────────────────────────

const HIT_BUF_SIZE = 64
const hitCanvas    = ref<HTMLCanvasElement | null>(null)
const hitBuf: number[] = []       // rolling ms-offset of recent hits
let   _prevHitAge  = Infinity

const STR_COLORS = ['#e04040','#40c040','#4060e0','#d4c040','#b040d0','#40b0c0','#e08040']

function _drawHitGraph(hw: any): void {
  const canvas = hitCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width, H = canvas.height
  const halfH = H >> 1

  ctx.clearRect(0, 0, W, H)

  // ── Top half: note timeline ──────────────────────────────────────────────
  const LOOKAHEAD    = 2.0
  const now          = hw.getTime?.() ?? 0
  const notes: any[] = hw.getNotes?.()  ?? []
  const chords: any[] = hw.getChords?.() ?? []
  const sc           = Math.max(hw.getStringCount?.() ?? 6, 1)
  const laneH        = (halfH - 2) / sc

  // "now" marker
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(0, 0, 1, halfH)

  const plotNote = (str: number, tOff: number, susWidth: number) => {
    if (tOff < 0 || tOff > LOOKAHEAD) return
    const x = Math.round((tOff / LOOKAHEAD) * (W - 2))
    const y = 1 + Math.round((str / sc) * (halfH - 2))
    const nw = Math.max(2, Math.min(susWidth, (W - 2) - x))
    const nh = Math.max(1, Math.round(laneH) - 1)
    ctx.fillStyle = STR_COLORS[str % STR_COLORS.length]
    ctx.fillRect(x, y, nw, nh)
  }

  for (const n of notes)
    plotNote(n.s, n.t - now, Math.max(2, Math.round(((n.sus ?? 0) / LOOKAHEAD) * W)))
  for (const ch of chords)
    for (const cn of (ch.notes ?? []))
      plotNote(cn.s, ch.t - now, 3)

  // Lane separator ticks (faint horizontal lines per string)
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let s = 1; s < sc; s++) {
    const y = 1 + Math.round((s / sc) * (halfH - 2))
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // Half divider
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath(); ctx.moveTo(0, halfH); ctx.lineTo(W, halfH); ctx.stroke()

  // ── Bottom half: hit accuracy scatter ────────────────────────────────────
  const ACC_RANGE = 50
  const midY  = halfH + halfH / 2
  const scale = (halfH / 2 - 2) / ACC_RANGE

  // 0 ms centre line
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.setLineDash([2, 3])
  ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke()

  // ±15 ms window
  const y15 = scale * 15
  ctx.strokeStyle = 'rgba(74,222,128,0.14)'
  ctx.beginPath(); ctx.moveTo(0, midY - y15); ctx.lineTo(W, midY - y15); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, midY + y15); ctx.lineTo(W, midY + y15); ctx.stroke()
  ctx.setLineDash([])

  // Dots
  const N = hitBuf.length
  for (let i = 0; i < N; i++) {
    const ms  = hitBuf[i]
    const x   = Math.round((i / HIT_BUF_SIZE) * (W - 3))
    const y   = Math.round(midY - Math.max(-ACC_RANGE, Math.min(ACC_RANGE, ms)) * scale)
    const abs = Math.abs(ms)
    ctx.fillStyle = abs <= 15 ? '#4ade80' : abs <= 30 ? '#fbbf24' : '#f87171'
    ctx.fillRect(x, y - 1, 3, 3)
  }

  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.font = '6px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('early', 1, halfH + 7)
  ctx.fillText('late',  1, H - 2)
}

// ── Text stats ────────────────────────────────────────────────────────────────

const nextNote    = ref('---')
const hitTiming   = ref('---')
const detectedHz  = ref('---')
const hitMapCount = ref('')
const renderTime  = ref('---')
const audioRawTime = ref('---')
const debugHitMap  = ref(false)

function toggleDebugHitMap(): void {
  debugHitMap.value = !debugHitMap.value
  localStorage.setItem('pitch_yin.debugHitMap', debugHitMap.value ? 'true' : 'false')
}

// ── rAF loop ──────────────────────────────────────────────────────────────────

let _rafId       = 0
let _frameCount  = 0
let _lastFpsTime = 0
let _lastRafNow  = 0

function _rafLoop(now: number): void {
  if (_lastRafNow > 0) {
    const dt = now - _lastRafNow
    if (dt > _maxFtInWindow) _maxFtInWindow = dt
  }
  _lastRafNow = now
  _frameCount++

  if (now - _lastFpsTime >= 500) {
    const elapsed = now - _lastFpsTime
    currentFps.value = Math.round((_frameCount / elapsed) * 1000)
    _frameCount  = 0
    _lastFpsTime = now

    fpsHistory.push(currentFps.value)
    if (fpsHistory.length > SAMPLES) fpsHistory.shift()
    _drawFps()

    const mem = (performance as any).memory
    if (mem) {
      const mb = mem.usedJSHeapSize / 1048576
      currentHeap.value = mb
      if (mb > _heapMax) _heapMax = mb
      heapHistory.push(mb)
      if (heapHistory.length > SAMPLES) heapHistory.shift()
      if (mode.value === 2) _drawHeap()
    }
  }

  _rafId = requestAnimationFrame(_rafLoop)
}

// ── 100 ms update ─────────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null

function _update(): void {
  currentFtMs.value = Math.round(_maxFtInWindow * 10) / 10
  ftHistory.push(_maxFtInWindow)
  if (ftHistory.length > SAMPLES) ftHistory.shift()
  _maxFtInWindow = 0
  if (mode.value === 2) _drawFt()

  const pb = (window as any).__perfBreakdown
  if (pb) perfBreakdown.value = { scorer: pb.scorer, store: pb.store, bundle: pb.bundle, total: pb.total }

  const hw    = (window as any).highway
  const audio = document.getElementById('audio') as HTMLAudioElement | null

  if (hw && audio) {
    const avOff    = (hw.getAvOffset?.() ?? 0) / 1000
    const rendered = (hw.getTime?.() ?? 0) + avOff
    const driftMs  = (rendered - audio.currentTime) * 1000
    currentDrift.value = Math.round(driftMs * 10) / 10
    driftHistory.push(driftMs)
    if (driftHistory.length > SAMPLES) driftHistory.shift()
    if (mode.value === 2) _drawDrift()
  }

  if (!hw) { nextNote.value = 'no highway'; return }

  // Track new hits for the accuracy graph
  const hd  = hw.hitDetector
  const acc = hd?.getLastHitAccuracy?.()
  if (acc && acc.age < _prevHitAge && acc.age < 180) {
    hitBuf.push(acc.ms)
    if (hitBuf.length > HIT_BUF_SIZE) hitBuf.shift()
  }
  _prevHitAge = acc?.age ?? Infinity
  if (mode.value === 2) _drawHitGraph(hw)

  if (mode.value < 2) return   // skip text stats in fps-only mode

  const now   = hw.getTime?.() ?? 0
  const avOff = (hw.getAvOffset?.() ?? 0) / 1000
  renderTime.value   = (now + avOff).toFixed(3) + 's'
  audioRawTime.value = audio ? audio.currentTime.toFixed(3) + 's' : 'n/a'

  const notes: any[]  = hw.getNotes?.()  ?? []
  const chords: any[] = hw.getChords?.() ?? []
  let bestT = Infinity, bestStr = -1, bestFret = -1

  for (const n of notes)  { if (n.t > now && n.t < bestT) { bestT = n.t; bestStr = n.s; bestFret = n.f } }
  for (const ch of chords) {
    if (ch.t > now && ch.t < bestT) {
      bestT = ch.t
      if (ch.notes?.length) { bestStr = ch.notes[0].s; bestFret = ch.notes[0].f }
    }
  }
  nextNote.value = bestT === Infinity
    ? 'end'
    : `s${bestStr + 1} f${bestFret} in ${bestT - now >= 1 ? (bestT - now).toFixed(2) : ((bestT - now) * 1000).toFixed(0) + 'ms'}`

  const acc2 = hd?.getLastHitAccuracy?.()
  hitTiming.value = acc2 ? (acc2.ms >= 0 ? `+${acc2.ms}ms late` : `${acc2.ms}ms early`) : '---'

  const det = (window as any).pitchYin?.getLastDetected?.()
  detectedHz.value = (det && det.hz > 0) ? `${det.hz.toFixed(1)} Hz (${(det.clarity * 100).toFixed(0)}%)` : '---'

  const hm = hd?.getHitMapEntries?.()
  hitMapCount.value = (hm && hm.length > 0)
    ? `♯${hm.length} ${(hd?.getLastMatchHz?.() ?? 0) > 0 ? hd.getLastMatchHz().toFixed(1) + 'Hz' : ''}`
    : ''
}

onMounted(() => {
  debugHitMap.value = localStorage.getItem('pitch_yin.debugHitMap') === 'true'
  _lastFpsTime = performance.now()
  _rafId = requestAnimationFrame(_rafLoop)
  _timer = setInterval(_update, 100)
})

onUnmounted(() => {
  if (_timer) clearInterval(_timer)
  if (_rafId) cancelAnimationFrame(_rafId)
})
</script>

<template>
  <!-- Mode 0: just a tiny toggle pill in the corner -->
  <button
    v-if="mode === 0"
    class="fixed bottom-16 left-2 z-[999] font-mono text-[9px] px-1 py-0.5 rounded bg-black/50 text-green-600/60 hover:text-green-400 pointer-events-auto select-none"
    @click="cycleMode"
  >D</button>

  <!-- Mode 1 & 2 panel -->
  <div
    v-else
    class="fixed bottom-16 left-2 z-[999] font-mono text-[10px] leading-tight text-green-400/80 bg-black/60 rounded px-1.5 py-1 select-none w-[136px]"
  >
    <!-- Header row: title + mode toggle -->
    <div class="flex items-center justify-between mb-1">
      <span class="text-green-700 text-[9px] uppercase tracking-wider">Debug</span>
      <button
        class="pointer-events-auto px-1 rounded text-[9px] bg-white/10 hover:bg-white/20 text-white/60 hover:text-white/90 transition-colors"
        @click="cycleMode"
      >{{ modeNextLbl }}</button>
    </div>

    <!-- ── FPS (modes 1 & 2) ── -->
    <div class="mb-1 pb-1 border-b border-white/[.04]">
      <div class="flex items-center justify-between mb-0.5">
        <span class="text-green-700">FPS</span>
        <span class="font-bold" :class="currentFps < 30 ? 'text-red-400' : currentFps < 50 ? 'text-yellow-400' : 'text-green-400'">{{ currentFps }}</span>
      </div>
      <canvas ref="fpsCanvas" :width="120" :height="24" class="block w-full rounded-sm bg-black/20" />
    </div>

    <!-- ── Full diagnostics (mode 2 only) ── -->
    <template v-if="mode === 2">

      <!-- Frame time -->
      <div class="mb-1 pb-1 border-b border-white/[.04]">
        <div class="flex items-center justify-between mb-0.5">
          <span class="text-green-700">Frame ms</span>
          <span class="font-bold" :class="currentFtMs >= 33 ? 'text-red-400' : currentFtMs >= 16.7 ? 'text-yellow-400' : 'text-green-400'">{{ currentFtMs.toFixed(1) }}</span>
        </div>
        <canvas ref="ftCanvas" :width="120" :height="24" class="block w-full rounded-sm bg-black/20" />
      </div>

      <!-- Heap (Chrome only) -->
      <div v-if="currentHeap >= 0" class="mb-1 pb-1 border-b border-white/[.04]">
        <div class="flex items-center justify-between mb-0.5">
          <span class="text-green-700">Heap MB</span>
          <span class="font-bold text-blue-400">{{ currentHeap.toFixed(1) }}</span>
        </div>
        <canvas ref="heapCanvas" :width="120" :height="24" class="block w-full rounded-sm bg-black/20" />
      </div>

      <!-- A/V drift -->
      <div class="mb-1 pb-1 border-b border-white/[.04]">
        <div class="flex items-center justify-between mb-0.5">
          <span class="text-green-700">A/V drift</span>
          <span class="font-bold" :class="Math.abs(currentDrift) >= 30 ? 'text-red-400' : Math.abs(currentDrift) >= 15 ? 'text-yellow-400' : 'text-emerald-400'">
            {{ currentDrift > 0 ? '+' : '' }}{{ currentDrift.toFixed(1) }}ms
          </span>
        </div>
        <canvas ref="driftCanvas" :width="120" :height="24" class="block w-full rounded-sm bg-black/20" />
      </div>

      <!-- rAF breakdown bars -->
      <div v-if="perfRows.length" class="mb-1 pb-1 border-b border-white/[.04]">
        <div class="text-green-700 mb-0.5">rAF <span class="opacity-40">({{ BAR_MAX_MS }}ms scale)</span></div>
        <div v-for="row in perfRows" :key="row.label" class="flex items-center gap-1 mb-px">
          <span class="w-9 text-right opacity-50 shrink-0">{{ row.label }}</span>
          <div class="flex-1 rounded-sm overflow-hidden bg-black/30" style="height:4px">
            <div class="h-full rounded-sm transition-all duration-100" :style="{ width: row.pct + '%', background: row.color }" />
          </div>
          <span class="w-8 text-right shrink-0 tabular-nums" :style="{ color: row.color }">{{ row.ms }}</span>
        </div>
      </div>

      <!-- Hit accuracy + note timeline graph -->
      <div class="mb-1 pb-1 border-b border-white/[.04]">
        <div class="flex items-center justify-between mb-0.5">
          <span class="text-green-700">Notes / Hits</span>
          <span class="opacity-30 text-[9px]">±50ms</span>
        </div>
        <canvas ref="hitCanvas" :width="120" :height="56" class="block w-full rounded-sm bg-black/20" />
        <div class="flex justify-between mt-px opacity-25 text-[8px]">
          <span>now</span><span>2s →</span>
        </div>
      </div>

      <!-- Text stats -->
      <div>Next: {{ nextNote }}</div>
      <div>Hit: {{ hitTiming }}</div>
      <div>YIN: {{ detectedHz }}</div>
      <div>Render T: {{ renderTime }}</div>
      <div>Audio T: {{ audioRawTime }}</div>
      <div v-if="hitMapCount">HM: {{ hitMapCount }}</div>

      <div class="mt-0.5 flex gap-1">
        <button
          class="px-1 rounded pointer-events-auto text-[9px]"
          :class="debugHitMap ? 'bg-yellow-700/80 text-yellow-200' : 'bg-white/10 text-white/50'"
          @click="toggleDebugHitMap"
        >HM{{ debugHitMap ? ' ON' : ' OFF' }}</button>
        <button
          class="px-1 rounded pointer-events-auto bg-white/10 text-white/70 hover:bg-white/20 text-[9px]"
          @click="(window as any).highway?.hitDetector?.dumpHitDebug?.()"
        >Dump</button>
      </div>

    </template>
  </div>
</template>
