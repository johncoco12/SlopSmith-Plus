cmake_minimum_required(VERSION 3.20)
project(pitch_yin CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(pitch_yin src/wasm_api.cpp)

target_include_directories(pitch_yin PRIVATE include)

# Emscripten link flags — keep the binary small and self-contained.
target_link_options(pitch_yin PRIVATE
    -O3
    -flto
    --no-entry
    -sEXPORTED_FUNCTIONS=["_pitch_init","_pitch_input_ptr","_pitch_window_size","_pitch_process","_pitch_get_hz","_pitch_get_clarity"]
    -sEXPORTED_RUNTIME_METHODS=["HEAPF32"]
    -sALLOW_MEMORY_GROWTH=0
    -sINITIAL_MEMORY=1MB
    -sENVIRONMENT=web
    -sMODULARIZE=1
    -sEXPORT_NAME=PitchYin
)

set_target_properties(pitch_yin PROPERTIES
    OUTPUT_NAME  "pitch_yin"
    SUFFIX       ".js"
)
