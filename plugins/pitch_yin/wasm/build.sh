#!/usr/bin/env bash
# Build the pitch_yin Wasm module with Emscripten.
#
# Prerequisites:
#   Emscripten SDK installed and activated:
#     git clone https://github.com/emscripten-core/emsdk
#     cd emsdk && ./emsdk install latest && ./emsdk activate latest
#     source ./emsdk_env.sh
#
# Usage:
#   ./build.sh          — release build
#   ./build.sh --debug  — debug build (no optimisation, source maps)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/../../static/vendor/pitch_yin"
SRC="${SCRIPT_DIR}/src/wasm_api.cpp"
INCLUDE="${SCRIPT_DIR}/include"

mkdir -p "$OUT_DIR"

if [[ "${1:-}" == "--debug" ]]; then
    OPT_FLAGS="-O0 -g -gsource-map"
    echo "[pitch_yin] debug build"
else
    OPT_FLAGS="-O3 -flto"
    echo "[pitch_yin] release build"
fi

emcc \
    $OPT_FLAGS \
    -std=c++20 \
    -I"$INCLUDE" \
    "$SRC" \
    --no-entry \
    -s EXPORTED_FUNCTIONS='["_pitch_init","_pitch_input_ptr","_pitch_window_size","_pitch_process","_pitch_get_hz","_pitch_get_clarity"]' \
    -s EXPORTED_RUNTIME_METHODS='["HEAPF32"]' \
    -s ALLOW_MEMORY_GROWTH=0 \
    -s INITIAL_MEMORY=1MB \
    -s ENVIRONMENT=web \
    -s MODULARIZE=1 \
    -s EXPORT_NAME=PitchYin \
    -o "${OUT_DIR}/pitch_yin.js"

echo "[pitch_yin] built → ${OUT_DIR}/pitch_yin.js + pitch_yin.wasm"
