cmake_minimum_required(VERSION 3.28...3.30)
project(vpx-js-wasm VERSION 3.7.0 LANGUAGES C CXX)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Emscripten required — use: emcmake cmake --preset wasm (or npm run build:wasm)")
endif()

option(PINMAME_WASM_PTHREADS "Enable pthreads (needs COOP/COEP)" ON)

add_subdirectory(modules/kernels)
add_subdirectory(modules/pinmame)
