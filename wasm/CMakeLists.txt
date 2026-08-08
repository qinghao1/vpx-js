cmake_minimum_required(VERSION 3.28...3.30)
project(wasm-pinmame VERSION 3.7.0 LANGUAGES C CXX)

set(PINMAME_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../external/pinmame" CACHE PATH "PinMAME source root")
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Emscripten required — use: emcmake cmake --preset wasm (or npm run build:wasm)")
endif()

option(PINMAME_WASM_PTHREADS "Enable pthreads (needs COOP/COEP)" ON)

add_library(pinmame_config INTERFACE)
target_compile_definitions(pinmame_config INTERFACE
  HAS_M6809=1 HAS_M6808=1 HAS_M6800=1 HAS_M6803=1 HAS_M6802=1
  HAS_ADSP2101=1 HAS_ADSP2105=1 HAS_ADSP2104=1
  HAS_Z80=1 HAS_M6502=1 HAS_M65C02=1 HAS_M68000=1 HAS_M68306=1
  HAS_S2650=1 HAS_8080=1 HAS_8085A=1 HAS_I8035=1 HAS_I8039=1
  HAS_I86=1 HAS_I88=1 HAS_I186=1 HAS_I188=1
  HAS_4004=1 HAS_PPS4=1 HAS_SCAMP=1 HAS_I8051=1 HAS_I8752=1
  HAS_TMS7000=1 HAS_TMS9900=1 HAS_CDP1802=1 HAS_COP400=1 HAS_COP420=1
  HAS_AT91=1 HAS_ARM7=1 HAS_TMS9980=1 HAS_TMS9995=1
  HAS_DAC=1 HAS_YM2151_YMFM=1 HAS_YM3812_YMFM=1 HAS_YM3526_YMFM=1 HAS_YMF262_YMFM=1
  HAS_HC55516=1 HAS_MC3417=1 HAS_SAMPLES=1 HAS_TMS5220=1 HAS_AY8910=1 HAS_MSM5205=1
  HAS_CUSTOM=1 HAS_BSMT2000=1 HAS_OKIM6295=1 HAS_ADPCM=1 HAS_VOTRAXSC01=1
  HAS_SN76477=1 HAS_SN76496=1 HAS_DISCRETE=1 HAS_SP0250=1 HAS_TMS320AV120=1
  HAS_M114S=1 HAS_S14001A=1 HAS_YM2203=1 HAS_TMS5110=1 HAS_SP0256=1 HAS_Y8950=1
  HAS_ASTROCADE=1 HAS_MEA8000=1 HAS_SAA1099=1 HAS_QSOUND=1
  MAMEVER=7300 PINMAME PINMAME_NO_UNUSED LIBPINMAME SAM_INCLUDE_COLORED
  LSB_FIRST PI=M_PI HAVE_UNISTD_H=1
  "INLINE=static inline __attribute__((always_inline))"
  WASM=1 PINMAME_WASM=1
)
target_compile_options(pinmame_config INTERFACE
  -ffp-contract=fast -fno-rtti -ffunction-sections -fdata-sections
  $<$<BOOL:${PINMAME_WASM_PTHREADS}>:-pthread>
)

file(GLOB_RECURSE PINMAME_SOURCES CONFIGURE_DEPENDS
  "${PINMAME_ROOT}/src/*.c" "${PINMAME_ROOT}/src/*.cpp"
  "${PINMAME_ROOT}/ext/*.c"  "${PINMAME_ROOT}/ext/*.cpp"
)
# Platform / UI — not needed for WASM
list(FILTER PINMAME_SOURCES EXCLUDE REGEX ".*src/(windows|vc|win32com|p-roc|instvpm|dbgfonts|lisy|ios|ui|unix|xml2info)/.*")
list(FILTER PINMAME_SOURCES EXCLUDE REGEX ".*/(wpc/altsound|sims/template)/.*")
list(FILTER PINMAME_SOURCES EXCLUDE REGEX ".*ext/(dmddevice|dinput|pinproc|htmlhelp)/.*")
# Legacy
list(FILTER PINMAME_SOURCES EXCLUDE REGEX ".*_old\\.(c|cpp)$")
list(FILTER PINMAME_SOURCES EXCLUDE REGEX ".*/sam_original\\.c$")
# sam.c is #included by se.c (se.c:1197) — don't compile standalone (duplicate samIntf)
list(FILTER PINMAME_SOURCES EXCLUDE REGEX ".*/src/wpc/sam\\.c$")
# Textually included — parent .c does #include
list(FILTER PINMAME_SOURCES EXCLUDE REGEX ".*/(arm7core|arm7exec|arm7jit|asmintf)\\.c$")
list(FILTER PINMAME_SOURCES EXCLUDE REGEX ".*ext/libsamplerate/.*\\.(c|cpp)$") # mixer.c includes samplerate
list(FILTER PINMAME_SOURCES EXCLUDE REGEX ".*/(2100ops|410ops|420ops|6800ops|6800tbl|6809ops|6809tbl|i8051ops|i86time|instr86|instr186|instrv30|t6502|t6510|t65c02|t65sc02|t65ce02|tdeco16|tn2a03|tms70op|tms70tb|disc_(dev|flt|inp|mth|out|wav)|tms5110r|tms5220r|ym2151_opm|m65ce02|d68k|m68k_in|m68kmake|make68k)\\.c$")
list(FILTER PINMAME_SOURCES INCLUDE REGEX "\\.(c|cpp)$")
list(APPEND PINMAME_SOURCES "${PINMAME_ROOT}/src/libpinmame/ticker.c")
list(REMOVE_DUPLICATES PINMAME_SOURCES)

add_executable(libpinmame ${PINMAME_SOURCES})
target_link_libraries(libpinmame PRIVATE pinmame_config)
target_include_directories(libpinmame PRIVATE
  "${PINMAME_ROOT}/src"
  "${PINMAME_ROOT}/src/wpc"
  "${PINMAME_ROOT}/src/cpu/m68000/generated_by_m68kmake"
  "${PINMAME_ROOT}/src/unix" "${PINMAME_ROOT}/src/unix/sysdep"
  "${PINMAME_ROOT}/ext/zlib" "${PINMAME_ROOT}/ext/ymfm"
  "${PINMAME_ROOT}/ext/libsamplerate" "${PINMAME_ROOT}/ext/miniaudio" "${PINMAME_ROOT}/ext/asmjit"
)
target_compile_options(libpinmame PRIVATE $<$<CONFIG:Release>:-O3> $<$<CONFIG:Debug>:-O0 -g3>)

# Minimal exports needed by lib/emu/pinmame — keep list tight to reduce wasm size
set(PINMAME_EXPORTS
  "_PinmameSetConfig" "_PinmameRun"
  "_PinmameSetSwitch" "_PinmameGetSwitch" "_PinmameSetSwitches"
  "_PinmameGetChangedLamps" "_PinmameGetChangedSolenoids" "_PinmameGetChangedGIs"
  "_PinmameGetDIP" "_PinmameSetDIP"
  "_malloc" "_free"
)
string(JOIN "," PINMAME_EXPORTS_JOIN ${PINMAME_EXPORTS})

target_link_options(libpinmame PRIVATE
  "-O$<$<CONFIG:Debug>:0>$<$<CONFIG:Release>:3>"
  -sWASM=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB -sMAXIMUM_MEMORY=256MB
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createPinmameModule
  "-sEXPORTED_FUNCTIONS=${PINMAME_EXPORTS_JOIN}"
  -sEXPORTED_RUNTIME_METHODS=cwrap,FS,HEAPU8,UTF8ToString,stringToUTF8,lengthBytesUTF8,getValue,setValue
  -sFORCE_FILESYSTEM=1 -sINVOKE_RUN=0 -sENVIRONMENT=web,worker,node -sWASM_ASYNC_COMPILATION=1
  "SHELL:-s ASSERTIONS=$<IF:$<CONFIG:Debug>,1,0>"
  --no-entry
  $<$<BOOL:${PINMAME_WASM_PTHREADS}>:-pthread>
  $<$<BOOL:${PINMAME_WASM_PTHREADS}>:-sPTHREAD_POOL_SIZE=4>
)

set_target_properties(libpinmame PROPERTIES OUTPUT_NAME "libpinmame" SUFFIX ".js" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/dist")
