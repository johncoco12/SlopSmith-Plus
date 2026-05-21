// Emscripten-exported C API for the YIN pitch detector.
//
// Design: shared-memory pattern — JS writes raw float32 samples directly
// into Wasm linear memory via HEAPF32, then calls pitch_process().
// This avoids copying through JS/Wasm boundaries on every audio frame.
//
// Exported symbols (prefixed _pitch_ in JS):
//   pitch_init(sample_rate)   — must be called once before processing
//   pitch_input_ptr()         → byte offset of the input sample buffer
//   pitch_window_size()       → number of float32 samples JS must write
//   pitch_process()           — run YIN on the current buffer contents
//   pitch_get_hz()            → detected fundamental in Hz, 0 = none
//   pitch_get_clarity()       → clarity score 0..1, higher = more confident

#include "yin.hpp"
#include <emscripten.h>

// ── Module state ─────────────────────────────────────────────────────────────

// Fixed window. With 4096 samples at 44100 Hz the detectable range is:
//   low  end: 44100 / 2048 ≈ 21.5 Hz  (below bass B1 at 30.9 Hz ✓)
//   high end: 44100 / 2    ≈ 22 kHz   (above guitar high-e at 1319 Hz ✓)
// The same bounds hold for 48000 Hz with proportionally scaled limits.
static constexpr int kWindowSize = 4096;

static float s_samples[kWindowSize]{};
static float s_sample_rate = 44100.0f;
static float s_last_hz     = 0.0f;
static float s_last_clarity = 0.0f;

// ── Exported API ─────────────────────────────────────────────────────────────

extern "C" {

EMSCRIPTEN_KEEPALIVE
void pitch_init(float sample_rate) {
    s_sample_rate  = sample_rate;
    s_last_hz      = 0.0f;
    s_last_clarity = 0.0f;
}

// Returns the byte address of s_samples inside Wasm linear memory.
// JS: Module.HEAPF32.set(float32Array, Module._pitch_input_ptr() >> 2)
EMSCRIPTEN_KEEPALIVE
float* pitch_input_ptr() {
    return s_samples;
}

EMSCRIPTEN_KEEPALIVE
int pitch_window_size() {
    return kWindowSize;
}

EMSCRIPTEN_KEEPALIVE
void pitch_process() {
    const auto result = yin::detect(s_samples, kWindowSize, s_sample_rate);
    if (result) {
        s_last_hz      = result->pitch_hz;
        s_last_clarity = result->clarity;
    } else {
        s_last_hz      = 0.0f;
        s_last_clarity = 0.0f;
    }
}

EMSCRIPTEN_KEEPALIVE
float pitch_get_hz() {
    return s_last_hz;
}

EMSCRIPTEN_KEEPALIVE
float pitch_get_clarity() {
    return s_last_clarity;
}

}  // extern "C"
