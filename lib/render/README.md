# Rendering

`IRenderApi` decouples the engine from any 3D framework: gameplay code in
`lib/game/` and `lib/vpt/` never touches three.js directly. The only backend
is `ThreeRenderApi` (`threejs/`); there is no Babylon adapter.

## Pipeline

```
preloadTextures → generateTableNode → postProcessScene → optimizeScene
     │                   │                                     │
     │                   │                    per-frame: state → updater → apply*
     │                   │                    late textures: resolvePendingTextures
```

1. **Preload** (`preloadTextures`): decode every table texture into GPU format
   up front, so later material swaps are synchronous cache hits.
2. **Generate** (`Table.generateTableNode`): for each item,
   `getMeshes()` returns a `Meshes` dict (name → `RenderInfo`), and
   `ThreeConverter` turns each entry into a `Group` of three.js meshes.
   `transformScene` sizes/orients the root node once (see Coordinates).
3. **Postprocess** (`postProcessScene`): name/classification fixups the
   generators cannot do — baked-lightmap material swaps, VR/cabinet
   visibility, glass/green-ramp/white-wall hiding, NaN sanitation.
4. **Batch** (`optimizeScene`, optional): fold static opaque meshes into
   `BatchedMesh`/`InstancedMesh` for draw-call reduction. Runs last because
   batching freezes topology: any later `applyMatrix/applyMesh/applyMaterial`
   call unbatches that mesh first (`unbatch`), and meshes with pending
   (not-yet-loaded) textures are skipped — retry after textures arrive.
5. **Per-frame** (`ItemUpdater`): physics/animation mutate `ItemState`;
   updaters push the delta through `applyMatrixToNode` / `applyMeshToNode` /
   `applyVisibility` / `applyLighting` / `applyMaterial`. Render code never
   reads state directly — updaters own that mapping.

## `IRenderApi<NODE, GEOMETRY, POINT_LIGHT>`

The three type params are the backend's scene-graph vocabulary, so the
engine stays framework-free. For three.js: `NODE = Object3D`,
`GEOMETRY = BufferGeometry`, `POINT_LIGHT = PointLight`.

## Units and coordinates

- VPX file units flow through unchanged until the scene root: geometry
  vertices stay in table units; `ThreeRenderApi.SCALE` (0.05) is applied
  once via `transformScene` (`rotateX(90°)`, center, uniform scale), which
  also lays the playfield flat (table +Y lands on world ±Z, i.e. depth).
- Handedness: VPX math is left-handed; three.js is right-handed. Every mesh
  generator emits `mesh.transform(Matrix3D.RIGHT_HANDED)` — a `(1, 1, −1)`
  scale — and `applyMatrixToNode` transposes the row-major VPX matrix
  (`v·M` convention) into three.js column-major storage. Both halves are
  required; applying only one mirrors the table.
- UVs: VPX `tv` counts from the top, WebGL from the bottom, hence
  `uv.y = 1 − tv` in `ThreeMeshGenerator`.
- `matrixAutoUpdate = false` on generated groups/meshes: matrices are pushed
  explicitly via `applyMatrixToNode`, so per-frame auto-recomposition would
  be pure overhead (and would fight updater-driven transforms).

## Materials

- **BDL** (`disableLighting`, `RenderInfo.disableLighting`): *not* a boolean.
  It is a 0..∞ file value mixing lit vs unlit in-shader: `0` = fully lit,
  `1` = unlit 2× fullbright (kept for native-compat), `>1` = HDR multiples
  (tables drive 130..8500). See `nodes/primitive-bdl-node.ts`.
- **VLM bakes**: table-authored pre-lit lightmap textures (names containing
  `bake`/`nestmap`), not a three.js concept. `isBaked` routes them to the
  unshaded path so scene lights do not double-light them.
- **TSL slot model**: node materials compose `colorNode` / `opacityNode` /
  `emissiveNode` graphs (`three/tsl`). Live uniforms are stashed on
  `material.userData` under the `MaterialSlots` contract
  (`threejs/material-slots.ts`) — never `.clone()` a node material directly;
  fork via `cloneMaterialForWrite`, which rebuilds the graph instead of
  JSON-flattening uniforms into dead literals.
- `IMaterialGenerator.getMaterial` takes 11 positional params in a fixed
  order (material, map, normalMap, envMap, emissiveMap, isTransparent,
  depthBias, disableLighting, addBlend, backfacesEnabled, alphaTestValue).
  `depthBias` is a transparent *sort key*, not a polygon offset;
  `alphaTestValue` in (0, 1] enables cutout.

## Texture loading contract

- `preloadTextures` resolves normally even when individual textures fail;
  per-texture outcome arrives via `onTexture(tex, ok)` plus a warn log.
  It only rejects on infrastructure failure (no loader, aborted run).
- Materials created before their texture arrives carry `pendingMap`-family
  keys in `userData` and render black/transparent until
  `resolvePendingTextures()` splices the late texture in. Forgetting that
  call strands the material mapless forever.
- Browser decode runs in a worker pool (`image-worker-pool.ts`, ≤4 workers);
  Node decodes inline. Oversized textures are downscaled to
  `getMaxTextureSize(name)`; EXR/HDR float textures go through dedicated
  loaders with an IDB cache.

## GPU-lifetime guidance

- Geometry: `applyMeshToNode` reuses the destination `BufferGeometry`
  in place (positions must match in count); scratch geometries go through
  `releaseGeometry` (also disposes the BVH bounds tree).
- Textures: `ThreeMapGenerator` owns the cache; `disposeUnused(usedNames)`
  drops everything else, `clear()` drops all.
- Materials: `ThreeNodeMaterialGenerator` caches by key for the generator's
  lifetime — treat it as table-scoped and drop the whole `ThreeRenderApi`
  with the table.
- Workers: `terminateImageWorkers()` on teardown; the EXR worker is
  per-call and needs no teardown.
