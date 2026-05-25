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
const LS_MONITOR_VOL    = 'pitch_yin.monitorVolume'
const LS_INPUT_VOLUME   = 'pitch_yin.inputVolume'

const CLARITY_DEFAULT   = 0.60
const MONITOR_DEFAULT   = 0
const INPUT_VOL_DEFAULT = 1.0

let _mod: any = null
let _audioCtx: AudioContext | null = null
let _micStream: MediaStream | null = null
let _source: MediaStreamAudioSourceNode | null = null
let _workletNode: AudioWorkletNode | null = null
let _inputGain: GainNode | null = null
let _monitorGain: GainNode | null = null
let _inputPtr = 0
let _running = false

let _lastDetectedHz = 0
let _lastDetectedClarity = 0

function getLastDetected(): { hz: number; clarity: number } {
  return { hz: _lastDetectedHz, clarity: _lastDetectedClarity }
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

// ── Input volume (mic pre-gain before YIN + monitor) ────────────────────

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
  if ((window as any).slopsmith?.audio?.registerFader) {
    _registerFaders()
  } else {
    window.addEventListener('slopsmith:audio:ready', _registerFaders, { once: true })
  }
}

function stop(): void {
  _unregisterFaders()
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
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', _onKeyDown)
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
  getLastDetected,
}

export {
  start, stop, isRunning, loadWasm,
  getInputVolume, setInputVolume,
  getMonitorVolume, setMonitorVolume,
  getLastDetected,
}
