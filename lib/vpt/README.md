# Table Elements

This folder contains the TypeScript side of the playfield items. Each item
covers data parsing, persisted state, mesh generation, and renderer updates;
collision handling, physical movement, animation, scripting, and gameplay run
inside the headless-WASM engine.

The original Visual Pinball source covers all of that in one class per item;
here each item gets its own folder with a focused main class plus helper
classes (JavaScript has no multiple inheritance):

- There is a _main class_ which is referenced by rest of the library. This class
  delegates most of its functionality to its _helper classes_.
- The helper classes are instantiated on-demand. For example, during mesh
  generation (or a GLTF export), no collision helpers will be created.
- No globals. If a class needs the player or the table object, it needs to be
  passed through the constructor or even better to the method only.

## Main Class

The main class of a playfield item is the class interacting with the rest of the
library. They are named without any suffix, like `Flipper`, `Rubber` and `Ball`.
They all extend [`Item`](item.ts).

- `IRenderable<STATE>` is for table elements that are rendered on the playfield.
  Collision (`IHittable`), movement (`IMovable`), animation (`IAnimatable`),
  gameplay (`IPlayable`), and script APIs (`IScriptable`) run inside the
  headless-WASM engine.

## Helper Classes

Some helpers exist for every item, others only for a few.

### Data Classes

These keep the properties of the `.vpx` file and know how to read them. They
are _usually_ read-only: changes during gameplay are reflected elsewhere,
with a few exceptions.

Most other helpers rely on data classes. All data classes except `BallData`
(which isn't persisted) extend [`ItemData`](item-data.ts).

### States

States contain the _visible state_ of a table element, i.e. changes the
renderer must take into account: position for movables, plus visibility,
material, and textures, which can also change during gameplay. They all
extend [`ItemState`](item-state.ts).

States arrive from the headless-WASM engine over the scene-sync bridge (see
`../wasm/`): the transfer object only contains the changed values of the state.

### Mesh Generators

Mesh generators provide 3D meshes of the playfield item based on their
parameters, i.e. their data. They are usually only used when the table is loaded
and the 3D model is created.

Mesh generators are called within the main class implementing `IRenderable`.
Their interface isn't defined, but they usually return a left-handed version
of `IRenderable`'s `getMeshes()`.

Collision (`Hits`, `Movers`), script APIs (`IScriptable`), and frame
animation (`IAnimatable`) run inside the headless-WASM engine; only
state application remains on the TS side.

### Updaters

Updaters receive a new state and apply it to the renderer. They usually update
the object's transformation, as well as visibility, material and textures.
Sometimes but rarely, they also update the mesh geometry.

In order to do that, they use a provided render adapter which applies the
changes to the scene.

## Table Core

### Loader flow

`Table.load()` runs `TableLoader.load()`, which fills a `LoadedTable`: one
array per `ITEM_REGISTRY` key, plus `items[name]` for every game item. The
`Table` constructor then converts each array into a name-keyed dict
(`flippers`, `lights`, …) via `populateFromLoaded`.

### Script execution

The VBScript source rides along in the `CODE` tag (see
[`lib/io/README.md`](../io/README.md)) and is decoded when `loadTableScript`
is set. It is handed to the headless-WASM engine with the table bytes; the
TS side keeps no transpiler.

### Material and texture resolution

Materials live on `TableData.materials` (parsed from the `MATE`/`PHMA`
tags). `Table.getMaterial()` tries an exact match, then a case-insensitive
fallback. Textures are keyed lowercase by name;
`Table.getTexture()` looks them up while image
bytes stream lazily via `table.streamStorage` (`table/table.ts:184`). Items
resolve both when building meshes in `getMeshes()`. (`mesh-loader.ts` is
unrelated: it only serves built-in static JSON meshes.)

### Units and coordinates

Table geometry stays in VP units until the scene root: 1 unit = 0.53975mm
(Earth g ≈ 1.81751 U/T² for the parsed gravity default); the renderer applies
`ThreeRenderApi.SCALE` (0.05) once. The playfield plane is XY at
z = 0 with +Z pointing up toward the glass. VP math is left-handed, three.js
is right-handed, so every mesh generator flips Z via
`Matrix3D.RIGHT_HANDED` — see "Units and coordinates" in
[`lib/render/README.md`](../render/README.md).

## Item and Family Notes

The data/state/api/updater/mesh-generator split is described above; this
section covers per-family semantics not obvious from the property names.

### Static vs dynamic rendering

Items whose mesh never changes are built once at load; items with movers or
animations push new state through their updater every frame. Static opaque
meshes are folded into batches (`three-batched-builder.ts`); a primitive
opts out with `staticRendering = false` or `animationFrames`
(`primitive/primitive-data.ts:86`).

### Ramps: `rampType`, habitrails, wires

`rampType` is an int (`Enums.RampType`: flat = 0, 4-wire = 1, 2-wire = 2,
3-wire-left = 3, 3-wire-right = 4, 1-wire = 5). A _habitrail_ is any
non-flat wire type (`isHabitrail()`, `ramp/ramp-view.ts:422`): an elevated
wire track, meshed as tubes sized by `wireDiameter`/`wireDistanceX`/
`wireDistanceY` instead of a solid surface. Ramps have separate visible wall
heights (`leftWallHeightVisible`/`rightWallHeightVisible`).

### Walls: physics vs visible heights

`SurfaceData.heightBottom` (default 0) / `heightTop` (default 50) drive
_both_ the collision polys and the visible mesh (`surface/surface.ts:74-75`,
`surface/surface-view.ts:23-24`) — there are no separate visible heights.
Use `isTopBottomVisible`/`isSideVisible` to hide faces instead.

### Spinners: angle units and axes

Data angles (`angleMin`/`angleMax`/`rotation`) are in degrees. The mesh
generator converts the base `rotation` about Z to radians; the updater
applies the live plate angle about X on top.

### Drag points: `fSmooth` and `fSlingshot`

Each drag point (`dragpoint.ts`) carries two flags: `fSmooth` selects
Catmull-Rom smoothing through that control point; `fSlingshot` marks the
segment as a kicking slingshot instead of a plain wall. Collision for both
lives in the headless-WASM engine.

### Flashers: support matrix

Parsed and scriptable; rendering is partial:

| Feature                   | Status                                                                 |
| ------------------------- | ---------------------------------------------------------------------- |
| `Filter` / `FilterAmount` | Parsed, not rendered (no custom shader; `flasher/flasher-data.ts:98`)  |
| `szImageB`                | Parsed, only ImageA is drawn (`flasher/flasher-data.ts:68`)            |
| Absorb blend mode         | Premultiplied-over (`AB_ABSORB`)                                       |
| `isDMD`                   | Parsed; skips the polygon mesh (`flasher/flasher-data.ts:93`)          |
| Runtime rotation/height   | Supported; updater rebakes the mesh (`flasher/flasher-updater.ts:218`) |

### Lights: glow vs surface vs bulb, fader modes

Which mesh a light builds depends on its flags (`light/light.ts:294`):
a bulb mesh (`showBulbMesh` + `meshRadius`), a bulb glow polygon (`bulbLight`
- 3 or more drag points), a playfield-surface insert (neither, + drag
  points), or a backglass light (`isBackglass`). `fader` (default Linear = 1,
  `Enums.Fader`: None = 0, Linear = 1, Incandescent = 2) selects the
  brightness envelope; bake-time levels come from `bakedIntensity`
  (`light/light.ts`), live levels from the WASM bridge.

### `SizingType`, DMD, transparency

- `SizingType` exists only on decals (`Enums.SizingType`: AutoSize = 0,
  AutoWidth = 1, ManualSize = 2).
- `isDMD` (dot-matrix-display rendering) is on flasher data.
- `isTransparent` is on flasher data.

### Plunger: the `PlungerDesc` lathe

`PlungerDesc` (`plunger/plunger-desc.ts:10-14`) is the plunger's lathe
profile: a list of (offset, diameter) coordinates revolved around the shaft
axis by the mesh generator (`plunger/plunger-mesh-generator.ts:34-56`).
`getModern()` returns 7 fixed coordinates, `getFlat()` is empty, and
`getCustom()` parses the `szTipShape` string plus rod/ring/spring params.

### Small-family `Data` classes

- `DecalData` (`decal/decal.ts:24`) — center/size/rotation, image-or-text
  (`decalType`), `sizingType`, target surface, material.
