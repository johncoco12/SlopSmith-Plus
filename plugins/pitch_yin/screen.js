// YIN pitch detector plugin.
//
// Loads the compiled pitch_yin.wasm module, opens the user's microphone,
// runs YIN pitch detection on each audio frame, and emits results on the
// slopsmith event bus so any other plugin or UI can consume them.
//
// Public API (window.pitchYin):
//   .start()                → Promise<void>  open mic + begin detection
//   .stop()                 → void           close mic + release resources
//   .isRunning()            → boolean
//   .getMonitorVolume()     → number         current monitor gain (0–2)
//   .setMonitorVolume(v)    → void           update monitor gain + persist
//
// Events emitted on window.slopsmith:
//   'pitch:detected'  → { hz: number, clarity: number }
//     hz:       detected fundamental in Hz
//     clarity:  confidence 0..1 (YAGNI: consumers should gate on > 0.85)
//
// When play-along is enabled (localStorage pitch_yin.playEnabled !== 'false'),
// detected pitches are matched against chart notes on the active highway and
// fed to highway.setNoteStateProvider so gems light up on correct hits.
//
// Monitor path: source → _monitorGain → destination (mixable via the Mixer popover).
// The ScriptProcessorNode output is zeroed so audio only reaches speakers through
// _monitorGain, giving clean volume control independent of the pitch detector.
//
// Keyboard shortcut: M — toggle mic on/off (player screen only)

(function () {
    'use strict';

    const WASM_URL     = '/static/vendor/pitch_yin/pitch_yin.js';
    const WINDOW_SIZE  = 4096;   // must match kWindowSize in wasm_api.cpp

    // Inline AudioWorklet source — loaded via Blob URL so no extra file is needed.
    // The worklet accumulates WINDOW_SIZE samples on the audio thread, then posts
    // them to the main thread asynchronously.  Unlike ScriptProcessorNode the
    // audio thread never waits for main-thread JS, so the monitor gain path runs
    // without scheduling gaps.
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
`;

    const LS_DEVICE_ID      = 'pitch_yin.deviceId';
    const LS_CLARITY        = 'pitch_yin.clarityThreshold';
    const LS_PLAY_ENABLED   = 'pitch_yin.playEnabled';
    const LS_PLAY_TOLERANCE = 'pitch_yin.playTolerance';
    const LS_MONITOR_VOL    = 'pitch_yin.monitorVolume';
    const LS_INPUT_LATENCY  = 'pitch_yin.inputLatencyMs';

    const CLARITY_DEFAULT   = 0.85;
    const TOLERANCE_DEFAULT = 50;    // cents — half a semitone
    const MONITOR_DEFAULT   = 0;     // start muted to prevent feedback surprise
    const HIT_BEFORE        = 0.12;  // seconds: detect a note up to 120 ms early
    const HIT_AFTER         = 0.25;  // seconds: accept a late hit up to 250 ms
    const HIT_FADE_MS       = 450;   // ms to sustain the lit-up effect after last detection

    // MIDI note numbers for each open string in standard tuning (index = string number)
    const OPEN_MIDI_GUITAR = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
    const OPEN_MIDI_BASS   = [28, 33, 38, 43];          // E1 A1 D2 G2

    // ── Module state ──────────────────────────────────────────────────────────

    /** @type {object|null} Loaded Emscripten module instance */
    let _mod          = null;
    let _audioCtx     = null;
    let _micStream    = null;
    let _source       = null;
    let _workletNode  = null;  // AudioWorkletNode for pitch detection
    let _monitorGain  = null;  // GainNode for speaker passthrough
    let _inputPtr     = 0;     // byte offset into Wasm linear memory
    let _running      = false;

    /** key `${chartTime}_${s}_${f}` → { at: DOMHighResTimeStamp } */
    const _hitMap = new Map();

    // ── Wasm loader ───────────────────────────────────────────────────────────

    function _loadWasm() {
        if (_mod) return Promise.resolve(_mod);
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = WASM_URL;
            script.onload = () => {
                // PitchYin() is the Emscripten module factory (MODULARIZE=1).
                // eslint-disable-next-line no-undef
                PitchYin().then(m => { _mod = m; resolve(m); }).catch(reject);
            };
            script.onerror = () => reject(new Error(`[pitch_yin] failed to load ${WASM_URL}`));
            document.head.appendChild(script);
        });
    }

    // ── Note frequency helpers ────────────────────────────────────────────────

    function _noteHz(s, f, songInfo) {
        const isBass = /bass/i.test(songInfo?.arrangement ?? '');
        const openMidi = isBass ? OPEN_MIDI_BASS : OPEN_MIDI_GUITAR;
        if (s < 0 || s >= openMidi.length) return 0;
        const tuning = songInfo?.tuning ?? [];
        const capo   = songInfo?.capo ?? 0;
        const midi   = openMidi[s] + (tuning[s] ?? 0) + capo + f;
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    function _centsDiff(hz, refHz) {
        if (refHz <= 0 || hz <= 0) return Infinity;
        return Math.abs(1200 * Math.log2(hz / refHz));
    }

    // ── Note state provider (feeds gem lighting to renderers) ─────────────────

    function _noteStateProvider(note, chartTime) {
        const key = `${chartTime}_${note.s}_${note.f}`;
        const entry = _hitMap.get(key);
        if (!entry) return null;
        const elapsed = performance.now() - entry.at;
        if (elapsed >= HIT_FADE_MS) {
            _hitMap.delete(key);
            return null;
        }
        const alpha = 1 - elapsed / HIT_FADE_MS;
        const state = (note.sus ?? 0) > 0.3 ? 'active' : 'hit';
        return { state, alpha };
    }

    function _registerProvider() {
        window.highway?.setNoteStateProvider?.(_noteStateProvider);
    }

    function _clearProvider() {
        window.highway?.setNoteStateProvider?.(null);
        _hitMap.clear();
    }

    // ── Pitch → chart note matching ───────────────────────────────────────────

    function _matchPitch(hz) {
        if (localStorage.getItem(LS_PLAY_ENABLED) === 'false') return;
        const hw = window.highway;
        if (!hw) return;

        // Shift playback clock back by the calibrated input pipeline latency so the
        // physical pluck moment (not the detection moment) is compared to chart notes.
        // Defaults to 0 when uncalibrated — the fixed HIT_BEFORE window still covers
        // typical YIN latency (~93 ms) in that case.
        const inputLatencyMs = parseFloat(localStorage.getItem(LS_INPUT_LATENCY)) || 0;
        const now      = (hw.getTime?.() ?? 0) - inputLatencyMs / 1000;
        const songInfo = hw.getSongInfo?.() ?? {};
        const tolerance = parseFloat(localStorage.getItem(LS_PLAY_TOLERANCE)) || TOLERANCE_DEFAULT;
        const perf     = performance.now();

        function _try(n, t) {
            const dt = t - now;
            if (dt < -HIT_BEFORE || dt > HIT_AFTER) return;
            const refHz = _noteHz(n.s, n.f, songInfo);
            if (refHz <= 0) return;
            if (_centsDiff(hz, refHz) <= tolerance) {
                _hitMap.set(`${t}_${n.s}_${n.f}`, { at: perf });
            }
        }

        for (const n of (hw.getNotes?.() ?? [])) _try(n, n.t);
        for (const ch of (hw.getChords?.() ?? [])) {
            for (const n of (ch.notes ?? [])) _try(n, ch.t);
        }
    }

    // ── Monitor volume (mic passthrough gain) ────────────────────────────────

    function _getMonitorVolume() {
        try {
            const v = localStorage.getItem(LS_MONITOR_VOL);
            return v !== null ? parseFloat(v) : MONITOR_DEFAULT;
        } catch (_) { return MONITOR_DEFAULT; }
    }

    function _setMonitorVolume(v) {
        try { localStorage.setItem(LS_MONITOR_VOL, String(v)); } catch (_) {}
        if (_monitorGain && _audioCtx) {
            // Smooth ramp to avoid clicks when the fader is moved
            _monitorGain.gain.setTargetAtTime(v, _audioCtx.currentTime, 0.01);
        }
    }

    function _registerMonitorFader() {
        const api = window.slopsmith?.audio;
        if (!api?.registerFader) return;
        api.registerFader({
            id:           'pitch_yin_monitor',
            label:        'Mic Monitor',
            min:          0,
            max:          2,
            step:         0.05,
            defaultValue: MONITOR_DEFAULT,
            getValue:     _getMonitorVolume,
            setValue:     _setMonitorVolume,
        });
    }

    function _unregisterMonitorFader() {
        window.slopsmith?.audio?.unregisterFader?.('pitch_yin_monitor');
    }

    // ── Microphone + audio pipeline ───────────────────────────────────────────

    async function _openMic(sampleRate) {
        _mod._pitch_init(sampleRate);
        _inputPtr = _mod._pitch_input_ptr();

        const deviceId = localStorage.getItem(LS_DEVICE_ID) || undefined;
        const constraints = {
            audio: {
                // Disable all browser-side processing so the raw waveform
                // reaches the detector unmodified.
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl:  false,
                ...(deviceId && { deviceId: { exact: deviceId } }),
            },
        };
        _micStream = await navigator.mediaDevices.getUserMedia(constraints);
        _source    = _audioCtx.createMediaStreamSource(_micStream);

        // Monitor path: source → gain → destination.
        // Volume starts from localStorage (default 0 = muted) so feedback
        // only happens when the user deliberately raises the fader.
        _monitorGain = _audioCtx.createGain();
        _monitorGain.gain.value = _getMonitorVolume();
        _source.connect(_monitorGain);
        _monitorGain.connect(_audioCtx.destination);

        // Pitch detection via AudioWorkletNode — runs on the audio rendering
        // thread so it never stalls the monitor gain path.  The worklet
        // accumulates WINDOW_SIZE samples then posts them here for Wasm YIN.
        const blob    = new Blob([_WORKLET_SRC], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        try {
            await _audioCtx.audioWorklet.addModule(blobUrl);
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
        _workletNode = new AudioWorkletNode(_audioCtx, 'pitch-yin-buffer');
        _workletNode.port.onmessage = _onAudioWindow;
        _source.connect(_workletNode);
        // Connect to destination so the worklet stays scheduled; output is
        // silent (worklet doesn't write to its output buffers).
        _workletNode.connect(_audioCtx.destination);
    }

    // Called asynchronously from the audio thread — no stall on the monitor path.
    function _onAudioWindow(event) {
        if (!_running) return;

        const samples = event.data;  // Float32Array posted by the worklet

        // Write directly into Wasm linear memory — no intermediate copy.
        _mod.HEAPF32.set(samples, _inputPtr >> 2);
        _mod._pitch_process();

        const hz        = _mod._pitch_get_hz();
        const clarity   = _mod._pitch_get_clarity();
        const threshold = parseFloat(localStorage.getItem(LS_CLARITY)) || CLARITY_DEFAULT;

        if (hz > 0 && clarity >= threshold) {
            _matchPitch(hz);
            window.slopsmith?.emit('pitch:detected', { hz, clarity });
        }
    }

    function _closeMic() {
        _running = false;
        _workletNode?.port.close();
        _workletNode?.disconnect();
        _monitorGain?.disconnect();
        _source?.disconnect();
        _micStream?.getTracks().forEach(t => t.stop());
        _audioCtx?.close();
        _audioCtx = _workletNode = _monitorGain = _source = _micStream = null;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    async function start() {
        if (_running) return;
        await _loadWasm();
        // 'interactive' requests the minimum system buffer size for lowest latency.
        _audioCtx = new AudioContext({ latencyHint: 'interactive' });
        await _openMic(_audioCtx.sampleRate);
        _running = true;
        _registerProvider();
        // Register monitor fader — defer if the audio API isn't ready yet.
        if (window.slopsmith?.audio?.registerFader) {
            _registerMonitorFader();
        } else {
            window.addEventListener('slopsmith:audio:ready', _registerMonitorFader, { once: true });
        }
    }

    function stop() {
        _clearProvider();
        _unregisterMonitorFader();
        _closeMic();
    }

    window.pitchYin = {
        start,
        stop,
        isRunning:       () => _running,
        loadWasm:        _loadWasm,         // shared with settings page (memoised)
        getModule:       () => _mod,
        getMonitorVolume: _getMonitorVolume,
        setMonitorVolume: _setMonitorVolume,
    };

    // ── Player integration ────────────────────────────────────────────────────

    // Stop the mic when the user navigates away from the player.
    const _origShowScreen = window.showScreen;
    if (typeof _origShowScreen === 'function') {
        window.showScreen = function (screen, ...args) {
            if (screen !== 'player' && _running) stop();
            return _origShowScreen.call(this, screen, ...args);
        };
    }

    // Keyboard shortcut: M — toggle mic (player screen only).
    if (typeof window.registerShortcut === 'function') {
        window.registerShortcut({
            key:         'm',
            description: 'Toggle microphone pitch detection',
            scope:       'player',
            handler:     () => (_running ? stop() : start()),
        });
    }

})();
