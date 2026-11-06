# `lib/wasm` — Headless-Engine Bridge Seam

TypeScript side of the upstream `vpinball` headless-engine bridge
(`src/web/vpx_wasm_bridge.cpp`, patches under `wasm/modules/headless/patches/`).
`lib/io` + `lib/vpt` parsing and the `lib/render/threejs` pipeline stay local;
physics, scripting, audio, and ROM emulation move to upstream C++ compiled to
WASM. This seam is the only boundary between them.

## Files

| File                      | Purpose                                                                                                                                                                                                                |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vpinball-wasm.ts`        | C ABI surface (`VpxWasm_*`), buffer kinds/strides/tags, and `loadHeadlessEngine`, which rejects with `HeadlessEngineMissingError` when the artifact 404s (`HeadlessEngineError` otherwise). No fake engine.            |
| `vpinball-wasm.spec.ts`   | Facade unit tests on a heap-backed fake bridge: ABI refusal, buffer/DMD/audio decoding, hostile descriptors, failure codes, load-error sorting, suspendable receiver.                                                  |
| `wasm-scene-sync.ts`      | `WasmSceneSync`: writes WASM buffer rows into the existing `*State` objects and calls the existing `*Updater.applyState`. The host (viewer) owns scene nodes, updaters, and the lightmap fan-out. No three.js imports. |
| `wasm-scene-sync.spec.ts` | Mocked-buffer unit tests: ball spawn/move/remove, every mover row, light rows, prim/flasher dirty rows, diff gating, phase timings, flasher image policy.                                                              |

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
(`@64a480a96`) — never from a side checkout — plus the patch series in
`wasm/modules/headless/patches/` (one concern per patch; see `wasm/README.md`).
Build with `npm run build:wasm:headless`, which outputs
`demo-browser/public/wasm/vpinball-headless.{js,wasm,wasm.map,data}` (gitignored).
`HeadlessEngine` is the only boundary: byte-array in, typed rows/DMD/PCM
audio/script errors out. Calls that may block on engine threads (`loadTable`,
`destroyTable`) enter WASM through `WebAssembly.promising` (JSPI).

The facade checks `VpxWasm_GetAbiVersion` once per module against
`HEADLESS_ABI_VERSION`; a mismatch throws `HeadlessEngineError` (`op: 'abi'`)
instead of degrading per frame. Bump both together when the row layout or an
export signature changes.

Keys (`pushKey`) fire script KeyDown/KeyUp events; buffered `getDmdFrame`
frames and solenoid motion need a scripted table plus VPinMAME.Controller.
`getScriptErrorCount`/`getScriptError` make script health observable instead
of silent. `getAudioInfo`/`getAudio` drain PinMAME ROM sound (int16 PCM,
message-bus subscription, no libpinmame changes); table script sounds play
through the engine's own miniaudio/SDL path, and the viewer unlocks both on
first gesture. Host mute/volume fans out to both: the WebAudio gain for the
ROM ring and `VpxWasm_SetAudioLevel` for the SDL path (table-seeded bus
volumes hold until the user touches a control; a gesture unlocks WebAudio
while the SDL path keeps table levels until then). The viewer wiring lives
in `demo-browser/src/wasm-engine.ts`.

## Viewer wiring

`demo-browser/src/wasm-engine.ts` (`WasmEngine`) owns the engine lifetime:
page-relative artifact load (via `document.baseURI`, so subpath deploys work),
ROM mount (explicit `?rom=` preload), `loadTable`, per-rAF
`stepFrame` + `WasmSceneSync` fan-out, ball spawn/remove, lamp-change set,
SDL-scancode input, nudge, destroy. The headless bridge is the only engine:
the viewer boots it at mount (a missing artifact stays viewer-only; play
entry retries). Stepping (`_syncPhysicsTransforms` delegates to
`_syncWasmTransforms` with the same pause/viewer gating), lightmap fan-out,
ball stats, key/nudge/touch/pointer input (`attachInput` → `InputHost`
adapter → viewer `_sendKey`), and teardown all route through it. SRGB DMD
triplets decode to dots-per-byte in the `dmdFrame` getter; reload clears
part names, cached DMD, balls, and destroys the prior engine.

Browser e2e (`integration.mjs`) drives the engine through the localhost-gated
typed test API (`window.vpx`, `demo-browser/src/test-api.ts`): a `wasmEngine`
leg asserts ready, catalog, zero script errors, tick + input; the gameplay
legs (ball, plunger, flipper, nudge, DMD) drive input through the API and
assert on engine state, while a few scene/presence legs read viewer scene
objects (table group, renderer stats).

## Browser requirements

The threaded engine needs a cross-origin-isolated page (`COOP`/`COEP` from
server headers, or the `VITE_COI_SW=1` service worker on static hosts) and a
browser with WebAssembly JSPI (`WebAssembly.promising`); the viewer renders
through WebGPU. `loadHeadlessEngine` fails fast with `HeadlessEngineError`
(`op: 'environment'`) without isolation, and the viewer adapter refuses to
start with `WasmEngineStartError` without JSPI.
