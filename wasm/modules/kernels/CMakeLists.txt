cmake_minimum_required(VERSION 3.28)
project(wasm-kernels LANGUAGES CXX)

add_executable(kernels src/kernels.cpp)

target_compile_features(kernels PRIVATE cxx_std_20)
target_compile_options(kernels PRIVATE
  -O3 -flto -msimd128
  -ffast-math -fno-exceptions -fno-rtti
  $<$<CONFIG:Debug>:-O0 -g3>
)

set(KERNELS_EXPORTS
  "_batchHitTestCircle" "_batchHitTestPlane" "_batchHitTestLineZ"
  "_batchHitTestPoint" "_batchHitTestTriangle" "_batchHitTestLineSeg"
  "_batchHitTestLine3D" "_batchHitTestPoly" "_batchElasticityWithFalloff"
  "_malloc" "_free"
)
list(JOIN KERNELS_EXPORTS "," KERNELS_EXPORTS_JOIN)

target_link_options(kernels PRIVATE
  -O3 -flto -msimd128
  -sWASM=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createKernelsModule
  "-sEXPORTED_FUNCTIONS=${KERNELS_EXPORTS_JOIN}"
  -sEXPORTED_RUNTIME_METHODS=HEAPF32,HEAP32
  -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,worker,node -sFILESYSTEM=0
  --no-entry
  $<$<CONFIG:Debug>:-sASSERTIONS=1>
  $<$<CONFIG:Release>:-sASSERTIONS=0>
)

set_target_properties(kernels PROPERTIES
  OUTPUT_NAME "kernels"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/dist"
)
