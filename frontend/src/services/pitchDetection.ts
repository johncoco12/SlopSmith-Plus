// Built-in YIN WASM pitch detection service.
//
// Loads the compiled pitch_yin.wasm module, opens the user's microphone,
// runs YIN pitch detection on each audio frame, and emits results on the
// slopsmith event bus so TunerPopover / LatencyTester can consume them.
//
// Also assigns window.pitchYin for backward compatibility with any legacy
// or third-party code that references the plugin API.
//
// Public API (same as legacy window.pitchYin):
//   start()                → Promise<void>  open mic + begin detection
//   stop()                 → void           close mic + release resources
//   isRunning()            → boolean
//   loadWasm()             → Promise<any>   memoised Wasm module loader
//   getMonitorVolume()     → number         current monitor gain (0–2)
//   setMonitorVolume(v)    → void           update monitor gain + persist
//
// Events emitted on window.slopsmith:
//   'pitch:detected'  → { hz: number, clarity: number }

const WASM_URL     = '/static/vendor/pitch_yin/pitch_yin.js'
const WINDOW_SIZE  = 4096

const _WORKLET_SRC = `
class PitchYinBuffer extends AudioWorkletProcessor {
    constructor() { super(); this._buf = new Float32Array(${WINDOW_SIZE}); this._n = 0; }
    process(inputs) {
        const ch = inputs[0]?.[0];
        if (!ch) return true;
        let i = 0;
        while (i < ch.length) {
            const take = Math.min(this._buf.length - this._n, ch.length - i);
            this._buf.set(ch.subarray(i, i + take), this._n);
            this._n += take; i += take;
            if (this._n === this._buf.length) {
                this.port.postMessage(this._buf.slice());
                this._n = 0;
            }
        }
        return true;
    }
}
registerProcessor('pitch-yin-buffer', PitchYinBuffer);
`

const LS_DEVICE_ID      = 'pitch_yin.deviceId'
const LS_CLARITY        = 'pitch_yin.clarityThreshold'
const LS_PLAY_ENABLED   = 'pitch_yin.playEnabled'
const LS_PLAY_TOLERANCE = 'pitch_yin.playTolerance'
const LS_MONITOR_VOL    = 'pitch_yin.monitorVolume'
const LS_INPUT_LATENCY  = 'pitch_yin.inputLatencyMs'

const CLARITY_DEFAULT   = 0.60
const TOLERANCE_DEFAULT = 50
const MONITOR_DEFAULT   = 0
const HIT_BEFORE        = 0.18
const HIT_AFTER         = 0.30
const HIT_FADE_MS       = 500
const LS_DEBUG_HITMAP   = 'pitch_yin.debugHitMap'

// Open-string MIDI numbers, thick → thin, index = RS string number (0 = lowest string)
const BASE_GUITAR6 = [40, 45, 50, 55, 59, 64]  // E2 A2 D3 G3 B3 E4
const BASE_GUITAR7 = [35, 40, 45, 50, 55, 59, 64]
const BASE_BASS4   = [28, 33, 38, 43]            // E1 A1 D2 G2
const BASE_BASS5   = [23, 28, 33, 38, 43]        // B0 E1 A1 D2 G2

function _baseMidis(stringCount: number, arrangement: string): number[] {
  const isBass = /bass/i.test(arrangement ?? '')
  if (isBass && stringCount === 5) return BASE_BASS5
  if (isBass)                      return BASE_BASS4
  if (stringCount === 7)           return BASE_GUITAR7
  return BASE_GUITAR6.slice(0, Math.min(stringCount, 6))
}

const LS_INPUT_VOLUME = 'pitch_yin.inputVolume'

let _mod: any = null
let _audioCtx: AudioContext | null = null
let _micStream: MediaStream | null = null
let _source: MediaStreamAudioSourceNode | null = null
let _workletNode: AudioWorkletNode | null = null
let _inputGain: GainNode | null = null
let _monitorGain: GainNode | null = null
let _inputPtr = 0
let _running = false

const _hitMap = new Map<string, { at: number }>()

// Debug hit timing — most recent match accuracy in ms (negative = early, positive = late)
let _lastHitAccuracyMs = 0
let _lastHitAt = 0
let _lastDetectedHz = 0
let _lastDetectedClarity = 0
let _lastMatchHz = 0

function getLastDetected(): { hz: number; clarity: number } {
  return { hz: _lastDetectedHz, clarity: _lastDetectedClarity }
}

function getLastMatchHz(): number { return _lastMatchHz }

function getLastHitAccuracy(): { ms: number; age: number } | null {
  const age = performance.now() - _lastHitAt
  if (age > 2000) return null
  return { ms: _lastHitAccuracyMs, age }
}

function getHitMapEntries(): Array<{ time: number; string: number; fret: number; age: number }> {
  const now = performance.now()
  const entries: Array<{ time: number; string: number; fret: number; age: number }> = []
  for (const [key, val] of _hitMap) {
    const age = now - val.at
    if (age >= HIT_FADE_MS) {
      _hitMap.delete(key)
      continue
    }
    const parts = key.split('_')
    if (parts.length === 3) {
      entries.push({
        time: parseFloat(parts[0]),
        string: parseInt(parts[1]),
        fret: parseInt(parts[2]),
        age,
      })
    }
  }
  return entries
}

function _drawHitMapDebug(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  if (localStorage.getItem(LS_DEBUG_HITMAP) !== 'true') return
  const hw = (window as any).highway
  if (!hw) return

  const now = hw.getTime?.() ?? 0
  const entries = getHitMapEntries()

  ctx.save()
  const STRING_COLORS = ['#e04040', '#40e040', '#4040e0', '#e0e040', '#e040e0', '#40e0e0', '#e08040']
  for (const entry of entries) {
    const tOff = entry.time - now
    const p = hw.project?.(tOff)
    if (!p) continue

    const x = hw.fretX?.(entry.fret, p.scale, W) ?? W / 2
    const y = p.y * H
    const alpha = Math.max(0.15, 1 - entry.age / HIT_FADE_MS)

    ctx.globalAlpha = alpha

    const color = STRING_COLORS[entry.string] ?? '#ffffff'

    // White cross
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    const sz = 6
    ctx.beginPath()
    ctx.moveTo(x - sz, y - sz)
    ctx.lineTo(x + sz, y + sz)
    ctx.moveTo(x + sz, y - sz)
    ctx.lineTo(x - sz, y + sz)
    ctx.stroke()

    // String-colored ring
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 10, 0, Math.PI * 2)
    ctx.stroke()

    // Fret label
    ctx.fillStyle = color
    ctx.font = `${Math.max(8, 10)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`${entry.fret}`, x, y - 12)
  }
  ctx.restore()

  if (entries.length > 0) {
    ctx.save()
    ctx.fillStyle = 'rgba(255,200,100,0.7)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`hitMap: ${entries.length}`, 4, H - 4)
    ctx.restore()
  }
}

// ── Wasm loader ──────────────────────────────────────────────────────────

function loadWasm(): Promise<any> {
  if (_mod) return Promise.resolve(_mod)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = WASM_URL
    script.onload = () => {
      ;(window as any).PitchYin().then((m: any) => { _mod = m; resolve(m) }).catch(reject)
    }
    script.onerror = () => reject(new Error(`[pitchDetection] failed to load ${WASM_URL}`))
    document.head.appendChild(script)
  })
}

// ── Note frequency helpers ──────────────────────────────────────────────

function _noteHz(s: number, f: number, songInfo: Record<string, any>): number {
  const sc = songInfo?.stringCount ?? (songInfo?.tuning?.length ?? 6)
  const bases = _baseMidis(sc, songInfo?.arrangement ?? '')
  if (s < 0 || s >= bases.length) return 0
  const tuning = songInfo?.tuning ?? []
  const capo   = songInfo?.capo ?? 0
  const midi   = bases[s] + (tuning[s] ?? 0) + capo + f
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function _centsDiff(hz: number, refHz: number): number {
  if (refHz <= 0 || hz <= 0) return Infinity
  return Math.abs(1200 * Math.log2(hz / refHz))
}

// ── Note state provider ──────────────────────────────────────────────────

function _noteStateProvider(note: any, chartTime: number): { state: string; alpha: number } | null {
  const key = `${chartTime}_${note.s}_${note.f}`
  const entry = _hitMap.get(key)
  if (!entry) return null
  const elapsed = performance.now() - entry.at
  if (elapsed >= HIT_FADE_MS) {
    _hitMap.delete(key)
    return null
  }
  const alpha = 1 - elapsed / HIT_FADE_MS
  return { state: (note.sus ?? 0) > 0.3 ? 'active' : 'hit', alpha }
}

function _registerProvider(): void {
  ;(window as any).highway?.setNoteStateProvider?.(_noteStateProvider)
}

function _clearProvider(): void {
  ;(window as any).highway?.setNoteStateProvider?.(null)
  _hitMap.clear()
}

// ── Pitch → chart note matching ─────────────────────────────────────────

function _matchPitch(hz: number): void {
  if (localStorage.getItem(LS_PLAY_ENABLED) === 'false') return
  const hw = (window as any).highway
  if (!hw) return

  const inputLatencyMs = parseFloat(localStorage.getItem(LS_INPUT_LATENCY)!) || 0
  const now      = (hw.getTime?.() ?? 0) - inputLatencyMs / 1000
  const songInfo = hw.getSongInfo?.() ?? {}
  const tolerance = parseFloat(localStorage.getItem(LS_PLAY_TOLERANCE)!) || TOLERANCE_DEFAULT
  const perf     = performance.now()

  function _try(n: any, t: number): void {
    const dt = t - now
    if (dt < -HIT_BEFORE || dt > HIT_AFTER) return
    const refHz = _noteHz(n.s, n.f, songInfo)
    if (refHz <= 0) return
    if (_centsDiff(hz, refHz) <= tolerance) {
      _hitMap.set(`${t}_${n.s}_${n.f}`, { at: perf })
      _lastHitAccuracyMs = -Math.round(dt * 1000)  // positive = late, negative = early
      _lastHitAt = perf
      _lastMatchHz = refHz
    }
  }

  for (const n of (hw.getNotes?.() ?? [])) _try(n, n.t)
  for (const ch of (hw.getChords?.() ?? [])) {
    for (const n of (ch.notes ?? [])) _try(n, ch.t)
  }
}

function _dumpSongData(): void {
  const hw = (window as any).highway
  if (!hw) return

  const detectorNotes  = hw.getNotes?.()  ?? []
  const detectorChords = hw.getChords?.() ?? []

  let renderNotes  = detectorNotes
  let renderChords = detectorChords
  try {
    const flt = (hw as any).filter
    if (flt?.getFiltered) {
      const f = flt.getFiltered()
      if (f?.notes)  renderNotes  = f.notes
      if (f?.chords) renderChords = f.chords
    }
  } catch {}

  console.group(`[songData] === Song Load ===`)
  console.log(`detector: ${detectorNotes.length} notes, ${detectorChords.length} chords`)
  console.log(`renderer: ${renderNotes.length} notes, ${renderChords.length} chords`)
  console.log(`match: ${detectorNotes.length === renderNotes.length && detectorChords.length === renderChords.length}`)

  if (detectorNotes.length !== renderNotes.length || detectorChords.length !== renderChords.length) {
    console.warn('⚠ detector vs renderer counts differ — mastery filter active')
  }

  const snip = (arr: any[], n = 5) =>
    arr.slice(0, n).map((x: any) => `t=${x.t} s${(x.s ?? 0) + 1} f${x.f}`).join(', ')

  console.log(`detector notes (first 5): ${snip(detectorNotes)}`)
  console.log(`renderer notes (first 5): ${snip(renderNotes)}`)

  // Log all notes if ≤ 50 to ease inspection
  if (detectorNotes.length <= 50) {
    console.log('all detector notes:', detectorNotes.map((n: any) => `(${n.t.toFixed(3)},${n.s},${n.f})`).join(' '))
  }
  if (renderNotes.length <= 50 && renderNotes !== detectorNotes) {
    console.log('all renderer notes:', renderNotes.map((n: any) => `(${n.t.toFixed(3)},${n.s},${n.f})`).join(' '))
  }
  console.groupEnd()
}

function dumpHitDebug(): void {
  const hw = (window as any).highway
  if (!hw) { console.log('[hitDebug] no highway'); return }

  const now      = hw.getTime?.() ?? 0
  const songInfo = hw.getSongInfo?.() ?? {}
  const notes    = hw.getNotes?.() ?? []
  const chords   = hw.getChords?.() ?? []

  console.group(`[hitDebug] now=${now.toFixed(3)}s  window=[${-HIT_BEFORE*1000},+${HIT_AFTER*1000}]ms`)

  const windowed: Array<{ t: number; s: number; f: number; refHz: number; key: string; inHitMap: boolean }> = []

  for (const n of notes) {
    const dt = n.t - now
    if (dt < -HIT_BEFORE || dt > HIT_AFTER) continue
    const refHz = _noteHz(n.s, n.f, songInfo)
    const key = `${n.t}_${n.s}_${n.f}`
    windowed.push({ t: n.t, s: n.s, f: n.f, refHz, key, inHitMap: _hitMap.has(key) })
  }
  for (const ch of chords) {
    for (const cn of ch.notes ?? []) {
      const dt = ch.t - now
      if (dt < -HIT_BEFORE || dt > HIT_AFTER) continue
      const refHz = _noteHz(cn.s, cn.f, songInfo)
      const key = `${ch.t}_${cn.s}_${cn.f}`
      windowed.push({ t: ch.t, s: cn.s, f: cn.f, refHz, key, inHitMap: _hitMap.has(key) })
    }
  }
  windowed.sort((a, b) => a.t - b.t)

  console.log(`windowed notes: ${windowed.length}`)
  for (const w of windowed) {
    console.log(`  ${w.inHitMap ? '✓' : '✗'} t=${w.t.toFixed(3)} s${w.s+1} f${w.f}  ${w.refHz.toFixed(1)}Hz  ${w.key}`)
  }

  const hm = getHitMapEntries()
  const extra = hm.filter(e => !windowed.some(w => w.key === `${e.time}_${e.string}_${e.fret}`))
  if (extra.length) {
    console.log(`extra hitMap (no matching note): ${extra.length}`)
    for (const e of extra) {
      console.log(`  ? t=${e.time.toFixed(3)} s${e.string+1} f${e.fret} age=${e.age.toFixed(0)}ms`)
    }
  }
  console.groupEnd()
}

// ── Input volume (mic pre-gain before YIN + monitor) ────────────────────

const INPUT_VOL_DEFAULT = 1.0

function getInputVolume(): number {
  try {
    const v = localStorage.getItem(LS_INPUT_VOLUME)
    return v !== null ? parseFloat(v) : INPUT_VOL_DEFAULT
  } catch { return INPUT_VOL_DEFAULT }
}

function setInputVolume(v: number): void {
  try { localStorage.setItem(LS_INPUT_VOLUME, String(v)) } catch {}
  if (_inputGain && _audioCtx) {
    _inputGain.gain.setTargetAtTime(v, _audioCtx.currentTime, 0.01)
  }
}

// ── Monitor volume (mic passthrough to speakers) ────────────────────────

function getMonitorVolume(): number {
  try {
    const v = localStorage.getItem(LS_MONITOR_VOL)
    return v !== null ? parseFloat(v) : MONITOR_DEFAULT
  } catch { return MONITOR_DEFAULT }
}

function setMonitorVolume(v: number): void {
  try { localStorage.setItem(LS_MONITOR_VOL, String(v)) } catch {}
  if (_monitorGain && _audioCtx) {
    _monitorGain.gain.setTargetAtTime(v, _audioCtx.currentTime, 0.01)
  }
}

function _registerFaders(): void {
  const api = (window as any).slopsmith?.audio
  if (!api?.registerFader) return
  api.registerFader({
    id:           'pitch_yin_input',
    label:        'Input',
    min:          0,
    max:          2,
    step:         0.05,
    defaultValue: INPUT_VOL_DEFAULT,
    getValue:     getInputVolume,
    setValue:     setInputVolume,
  })

}

function _unregisterFaders(): void {
  const api = (window as any).slopsmith?.audio
  api?.unregisterFader?.('pitch_yin_input')
  api?.unregisterFader?.('pitch_yin_monitor')
}

// ── Microphone + audio pipeline ─────────────────────────────────────────

async function _openMic(sampleRate: number): Promise<void> {
  _mod._pitch_init(sampleRate)
  _inputPtr = _mod._pitch_input_ptr()

  const deviceId = localStorage.getItem(LS_DEVICE_ID) || undefined
  const constraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl:  false,
      ...(deviceId && { deviceId: { exact: deviceId } }),
    } as any,
  }

  _micStream = await navigator.mediaDevices.getUserMedia(constraints)
  _source = _audioCtx!.createMediaStreamSource(_micStream)

  _inputGain = _audioCtx!.createGain()
  _inputGain.gain.value = getInputVolume()
  _source.connect(_inputGain)

  _monitorGain = _audioCtx!.createGain()
  _monitorGain.gain.value = getMonitorVolume()

  _inputGain.connect(_monitorGain)
  _monitorGain.connect(_audioCtx!.destination)

  const blob = new Blob([_WORKLET_SRC], { type: 'application/javascript' })
  const blobUrl = URL.createObjectURL(blob)
  try {
    await _audioCtx!.audioWorklet.addModule(blobUrl)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
  _workletNode = new AudioWorkletNode(_audioCtx!, 'pitch-yin-buffer')
  _workletNode.port.onmessage = _onAudioWindow
  _inputGain.connect(_workletNode)
  _workletNode.connect(_audioCtx!.destination)
}

function _onAudioWindow(event: MessageEvent): void {
  if (!_running) return
  const samples = event.data as Float32Array
  _mod.HEAPF32.set(samples, _inputPtr >> 2)
  _mod._pitch_process()
  const hz = _mod._pitch_get_hz() as number
  const clarity = _mod._pitch_get_clarity() as number
  const threshold = parseFloat(localStorage.getItem(LS_CLARITY)!) || CLARITY_DEFAULT
  _lastDetectedHz = hz
  _lastDetectedClarity = clarity
  if (hz > 0 && clarity >= threshold) {
    _matchPitch(hz)
    ;(window as any).slopsmith?.emit?.('pitch:detected', { hz, clarity })
  }
}

function _closeMic(): void {
  _running = false
  _workletNode?.port.close()
  _workletNode?.disconnect()
  _monitorGain?.disconnect()
  _inputGain?.disconnect()
  _source?.disconnect()
  _micStream?.getTracks().forEach(t => t.stop())
  _audioCtx?.close()
  _audioCtx = _workletNode = _inputGain = _monitorGain = _source = _micStream = null as any
}

// ── Public API ──────────────────────────────────────────────────────────

async function start(): Promise<void> {
  if (_running) return
  await loadWasm()
  _audioCtx = new AudioContext({ latencyHint: 'interactive' })
  await _openMic(_audioCtx.sampleRate)
  _running = true
  _registerProvider()
  const hw = (window as any).highway
  if (hw?.addDrawHook) hw.addDrawHook(_drawHitMapDebug)
  if ((window as any).slopsmith?.audio?.registerFader) {
    _registerFaders()
  } else {
    window.addEventListener('slopsmith:audio:ready', _registerFaders, { once: true })
  }
}

function stop(): void {
  _clearProvider()
  _unregisterFaders()
  const hw = (window as any).highway
  if (hw?.removeDrawHook) hw.removeDrawHook(_drawHitMapDebug)
  _closeMic()
}

function isRunning(): boolean { return _running }

// ── Keyboard shortcut: M — toggle mic ───────────────────────────────────

function _onKeyDown(e: KeyboardEvent): void {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
  const player = document.getElementById('highway')
  if (!player) return
  if (e.key === 'm' || e.key === 'M') {
    e.preventDefault()
    if (_running) stop()
    else start()
    return
  }
  if (e.key === 'h' || e.key === 'H') {
    e.preventDefault()
    const on = localStorage.getItem(LS_DEBUG_HITMAP) === 'true'
    localStorage.setItem(LS_DEBUG_HITMAP, on ? 'false' : 'true')
    console.log(`[pitchDetection] debug hitMap overlay: ${on ? 'OFF' : 'ON'}`)
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', _onKeyDown)
}

if (typeof window !== 'undefined') {
  const sw = (window as any).slopsmith
  if (sw?.on) {
    sw.on('song:ready', _dumpSongData)
  } else {
    // slopsmith not ready yet — retry once after a tick
    setTimeout(() => (window as any).slopsmith?.on?.('song:ready', _dumpSongData), 0)
  }
}

// ── Assign window.pitchYin for backward compat ──────────────────────────

;(window as any).pitchYin = {
  start,
  stop,
  isRunning,
  loadWasm,
  getModule: () => _mod,
  getInputVolume,
  setInputVolume,
  getMonitorVolume,
  setMonitorVolume,
  getLastHitAccuracy,
  getLastDetected,
  getLastMatchHz,
  getHitMapEntries,
  dumpHitDebug,
}

export {
  start, stop, isRunning, loadWasm,
  getInputVolume, setInputVolume,
  getMonitorVolume, setMonitorVolume,
  getLastHitAccuracy,
  getLastDetected,
  getLastMatchHz,
  getHitMapEntries,
  dumpHitDebug,
}
