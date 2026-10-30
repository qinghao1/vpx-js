# three.js backend

Implements `IRenderApi<Object3D, BufferGeometry, PointLight>` on three.js
WebGPU + TSL node materials. Start at `three-render-api.ts`, then follow the
pipeline in [`../README.md`](../README.md).

## Module map

| File(s)                                                                                                                                                                                     | Role                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `three-render-api.ts`                                                                                                                                                                       | Facade: owns converter + generators, applies per-frame updates                   |
| `three-converter.ts`                                                                                                                                                                        | `RenderInfo` → `Mesh`/`Group` (geometry + initial material)                      |
| `three-mesh-generator.ts`                                                                                                                                                                   | VPX `Mesh` → `BufferGeometry` (positions verbatim, UVs flipped)                  |
| `three-node-material-generator.ts` + `imaterial-generator.ts`                                                                                                                               | Cached TSL materials; late-texture arrival via `resolvePendingTextures`          |
| `material-slots.ts`, `material-shared.ts`                                                                                                                                                   | `userData` slot contract; fork-safe clone; baked detection                       |
| `nodes/`                                                                                                                                                                                    | One TSL factory per shading model (BDL, baked, bulb glow, DMD, ball, overlay)    |
| `three-map-generator.ts`                                                                                                                                                                    | Texture cache + concurrent preload; owns GPU texture lifetime                    |
| `three-texture-loader-browser.ts` / `-node.ts`                                                                                                                                              | Platform decode (workers + IDB cache vs inline)                                  |
| `three-scene-postprocess.ts` (+ `scene-classify.ts`, `visibility-heuristics.ts`, `baked-materials.ts`, `cabinet-buttons.ts`, `procedural-room.ts`, `swipe-nudge.ts`, `authored-visible.ts`) | Name/classification fixup pass after generation                                  |
| `three-batched-builder.ts`                                                                                                                                                                  | Optional draw-call reduction (`optimizeScene`) after postprocess                 |
| `batched-visibility.ts`                                                                                                                                                                     | Fused batch-slot + visibility walk (`applyVisibility` delegate), zero-scale hide |
| `three-light-generator.ts`, `three-light-mesh-generator.ts`, `three-playfield-mesh-generator.ts`                                                                                            | Point lights, glow/light geometry, playfield geometry                            |
| `three-render-pipeline.ts`, `tone-mapping.ts`                                                                                                                                               | Post chain (bloom + tone map + exposure)                                         |
| `three-camera-framing.ts`                                                                                                                                                                   | Viewer/play camera fits                                                          |
| `three-bvh.ts`                                                                                                                                                                              | BVH install for raycast/hit-test acceleration                                    |
| `transmission-buffer.ts`                                                                                                                                                                    | Playfield-UV bulb-light buffer sampled by BDL shaders                            |
| `image-worker-pool.ts`, `workers/`, `hdr-decode.worker.node.ts`, `deferred-texture.ts`                                                                                                      | Off-thread image decode plumbing                                                 |

## Upstream parity notes

Three deliberate divergences from VPinball, each pinned by a spec:

- `AB_ADD` flashers stay plain additive. Upstream pairs `REVSUBTRACT` with a
  negatively-encoded shader output (`flasher.cpp`, `fs_flasher.sc`); this
  backend emits positive premultiplied color, which that blend would darken.
- Bulb halos emit only the `(1-modulate)` add term with plain additive
  blending. The upstream `dst`-modulated term (`fs_light.sc`) needs
  framebuffer feedback, unavailable in a single forward pass.
- VR-room/cabinet meshes are always forced visible (upstream hides them via
  `PartGroupData::PlayerModeVisibilityMask` per player mode); threading the
  real player mode through is a follow-up.
