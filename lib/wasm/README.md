# `lib/wasm` — Headless-Engine Bridge Seam

TypeScript side of the upstream `vpinball` headless-engine bridge
(`src/web/vpx_wasm_bridge.cpp`, patches under `wasm/modules/headless/patches/`).
`lib/io` + `lib/vpt` parsing and the `lib/render/threejs` pipeline stay local;
physics, scripting, audio, and ROM emulation move to upstream C++ compiled to
WASM. This seam is the only boundary between them.

## Files

| File                      | Purpose                                                                                                                                                                                                                |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vpinball-wasm.ts`        | C ABI surface (`VpxWasm_*`), buffer kinds/strides/tags, and `loadHeadlessEngine`, which rejects with `HeadlessEngineMissingError` when the artifact is missing. No fake engine.                                        |
| `wasm-scene-sync.ts`      | `WasmSceneSync`: writes WASM buffer rows into the existing `*State` objects and calls the existing `*Updater.applyState`. The host (viewer) owns scene nodes, updaters, and the lightmap fan-out. No three.js imports. |
| `wasm-scene-sync.spec.ts` | Mocked-buffer unit tests: ball spawn/move/remove, every mover row, light rows, prim/flasher dirty rows, buffer contract, honest loader failure.                                                                        |

## Constraints

- `lib/render/irender-api.ts` stays generic (`<NODE, GEOMETRY, POINT_LIGHT>`); sync code never imports three.js.
- Upstream API surface is minimal and reuses existing APIs: the part
  getters exist only where no public accessor does (hit-object movers,
  private animation fields); `StepHeadlessFrame` is required because
  `FinishFrame`/`PrepareFrame` are private; input, DMD, and script-error
  reporting reuse `m_pininput`, `m_dmdFrame`, and `m_nScriptErrorNotification`.
- Updater overrides (`FlasherState.intensityScale/modulateVsAdd/addBlend/addBlendMode`,
  `LightState.baseIntensity/intensityScale/inPlayState`, `HitTargetState.isDropped`)
  are `?? data` fallbacks: engine state wins, authored data stays the default.
- Flasher script image swaps ride the optional `flasherImage` policy (name in,
  once the bridge exposes `VpxWasm_GetFlasherImage`); absent leaves `imageA`
  untouched and the static fast path intact.

## Status

Bridge live, built from the pinned `external/vpinball` submodule
(`@64a480a96`) — never from a side checkout. The bridge is eleven patches in
`wasm/modules/headless/patches/` (`0001` new `src/web/vpx_wasm_bridge.cpp`;
`0002` part-state getters; `0003` headless step + script-error record;
`0004` Noop render-device guards; `0005` CMake target; `0006` DMD mirror;
`0007` IsPlaying ignores window focus headless; `0008` host-paced
PinMAME time fence; `0009` PinMAME ROM-audio capture to a drained int16
PCM ring; `0010` drop of the SDL echo of ring-forwarded lanes; `0011`
silence of the refresh-rate probe error), applied idempotently at build time
like the PinMAME patches. Do not hand-edit the
submodule; change the patch files. Build with `npm run build:wasm:headless`
(`wasm/build-headless.sh`: patches → third-party libs → configure →
`vpinball-headless` target → deploy), which outputs
`demo-browser/public/wasm/vpinball-headless.{js,wasm,data}` (gitignored).
`HeadlessEngine` is the only boundary: byte-array in, typed rows/DMD/PCM
audio/script errors out. Calls that may block on engine threads (`loadTable`,
`destroyTable`) enter WASM through `WebAssembly.promising` (JSPI).

Keys (`pushKey`) fire script KeyDown/KeyUp events; buffered `getDmdFrame`
frames and solenoid motion need a scripted table plus VPinMAME.Controller.
`getScriptErrorCount`/`getScriptError` make script health observable instead
of silent. `getAudioInfo`/`getAudio` drain PinMAME ROM sound (int16 PCM,
message-bus subscription, no libpinmame changes); table script sounds play
through the engine's own miniaudio/SDL path, and the viewer unlocks both on
first gesture. The viewer wiring lives in `demo-browser/src/wasm-engine.ts`.

## Viewer wiring

`demo-browser/src/wasm-engine.ts` (`WasmEngine`) owns the engine lifetime:
root-absolute artifact load, `init`, ROM mount (explicit `?rom=` preload,
then `__pendingRom` file bytes), `loadTable`, per-rAF
`stepFrame` + `WasmSceneSync` fan-out, ball spawn/remove, lamp-change set,
SDL-scancode input, nudge, destroy. The headless bridge is the only engine:
the viewer boots it at mount (a missing artifact stays viewer-only; play
entry retries). Stepping (`_syncPhysicsTransforms` delegates to
`_syncWasmTransforms` with the same pause/viewer gating), lightmap fan-out,
ball stats, key/nudge/touch/pointer input (`attachInput` → `InputHost`
adapter → viewer `_sendKey`), and teardown all route through it. SRGB DMD
triplets decode to dots-per-byte in the `dmdFrame` getter; reload clears
part names, cached DMD, balls, and destroys the prior engine.

A/B (`integration.mjs`, `table-empty.vpx`): the former TS-player legs
(transpile, ball, physics) skip honestly and a `wasmEngine` leg asserts the
Stage-1 guarantees (ready, catalog, zero script errors, tick + input).
(Stage/phase/§ references below are to the rescope plan at
`/home/qinghao1/docs/vpx-js-threejs-rescope-plan.md`.)
Shared legs keep their Phase-3 shapes (pageerrors, diagnostics, playfield,
plunger, nudge, dmd, backbox, camera, runErrors); `sound` now exercises the
WASM module (drained ROM PCM energy on game events; script sounds ride the
engine's miniaudio/SDL path and need a viewer gesture); the only flake is
the camera leg, which intermittently stalls on run start in shared transition
code under SwiftShader (passes on retry). No leg thresholds changed.

§5.2 (TS engine removal) is executed: `lib/scripting`, `lib/physics`,
`lib/audio`, `lib/game`, and the per-item runtime (`*-api`, `*-hit`,
`*-mover`, `*-physics`, hit generators, collections, timers,
lightseqs, textboxes, dispreels, sounds) are deleted — mesh `FrameData`
stays, its drivers are gone; the viewer, input,
harness, and bench are WASM-only. The seam above is the only boundary.
Scripted-table behavior (script execution, PinMAME.Controller, DMD frames,
credit/start/eject, plunger launch, playfield ball, flipper drive and
solenoids, drain relaunch, tilt) is verified live in the WASM build on the
TWD table: coin pulses register credits, start ejects to the shooter lane,
plunger and flippers behave, and the DMD/trough track the game. Probe at
realtime pacing with wall-time key holds (tight bursts starve the PinMAME
thread, and short holds are sub-millisecond in wall time); this ROM prices
several coins per credit. Regression legs must stay honest: skips/fails keep
their reasons and must not be edited into passes.
