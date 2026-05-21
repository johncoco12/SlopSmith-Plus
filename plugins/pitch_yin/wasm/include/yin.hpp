// YIN fundamental-frequency estimator.
// de Cheveigné, A., Kawahara, H. (2002). "YIN, a fundamental frequency
// estimator for speech and music." J. Acoust. Soc. Am. 111(4), 1917-1930.
//
// This is a pure, stateless header-only implementation.
// It has no external dependencies and performs no heap allocation.
#pragma once

#include <cmath>
#include <cstddef>
#include <optional>

namespace yin {

// Maximum half-window the scratch buffer in detect() can hold.
// Window size passed to detect() must satisfy: window_size / 2 <= kMaxHalf.
inline constexpr std::size_t kMaxHalf = 2048;

// CMNDF threshold recommended by the original paper (section II.C).
// Lower → more selective (fewer false positives, more misses).
// Higher → more permissive (more detections, more false positives).
inline constexpr float kDefaultThreshold = 0.12f;

struct Result {
    float pitch_hz;
    float clarity;  // 1 - d'(tau_est); higher = more confident; range (0, 1]
};

// Detect the fundamental frequency in the frame [samples, samples+window_size).
//
// Preconditions:
//   window_size is even, window_size / 2 <= kMaxHalf
//   sample_rate > 0
//
// Returns std::nullopt when no pitch dips below the threshold
// (silence, noise, or a pitch period that doesn't fit in the window).
inline std::optional<Result> detect(
    const float* samples,
    std::size_t  window_size,
    float        sample_rate,
    float        threshold = kDefaultThreshold) noexcept
{
    const std::size_t half = window_size / 2;

    // Stack scratch buffer — 8 KiB at kMaxHalf=2048; safe for Wasm.
    // Index 0 is defined as 1.0 (CMNDF step, eq. 9 in the paper).
    float d[kMaxHalf];
    d[0] = 1.0f;

    // Steps 1 + 2: difference function and cumulative mean normalised
    // difference (CMNDF) computed together to avoid two passes.
    //
    // d(tau)  = sum_{j=0}^{half-1} ( x[j] - x[j+tau] )^2
    // d'(tau) = d(tau) * tau / sum_{j=1}^{tau} d(j)
    float running = 0.0f;
    for (std::size_t tau = 1; tau < half; ++tau) {
        float sum = 0.0f;
        for (std::size_t j = 0; j < half; ++j) {
            const float delta = samples[j] - samples[j + tau];
            sum += delta * delta;
        }
        running += sum;
        // Guard against silent/constant input where running stays near zero.
        d[tau] = (running > 1e-10f)
            ? sum * static_cast<float>(tau) / running
            : 1.0f;
    }

    // Step 3: absolute threshold.
    // Find the first tau >= 2 where d'(tau) dips below `threshold`, then
    // walk forward to the local minimum within that dip.
    std::size_t tau_est = 0;
    for (std::size_t tau = 2; tau < half - 1; ++tau) {
        if (d[tau] < threshold) {
            while (tau + 1 < half - 1 && d[tau + 1] < d[tau]) ++tau;
            tau_est = tau;
            break;
        }
    }
    if (tau_est == 0) return std::nullopt;

    // Step 4: parabolic interpolation for sub-sample period accuracy.
    float t = static_cast<float>(tau_est);
    {
        const float a = d[tau_est - 1];
        const float b = d[tau_est];
        const float c = d[tau_est + 1];
        const float denom = a - 2.0f * b + c;
        if (std::abs(denom) > 1e-7f) {
            t += 0.5f * (a - c) / denom;
        }
    }

    if (t <= 0.0f) return std::nullopt;

    return Result{
        .pitch_hz = sample_rate / t,
        .clarity  = 1.0f - d[tau_est],
    };
}

}  // namespace yin
