# Table Elements

This folder contains implementations of the playfield items. Each item spans
data parsing, mesh generation, collision handling, physical movement,
animation, scripting, and state management.

The original Visual Pinball source covers all of that in one class per item;
here each item gets its own folder with a focused main class plus helper
classes (JavaScript has no multiple inheritance):

- There is a *main class* which is referenced by rest of the library. This class
  delegates most of its functionality to its *helper classes*.
- The helper classes are instantiated on-demand. For example, during mesh
  generation, no collision helpers will be created.
- No globals. If a class needs the player or the table object, it needs to be 
  passed through the constructor or even better to the method only.
  
## Main Class

The main class of a playfield item is the class interacting with the rest of the
library. They are named without any suffix, like `Flipper`, `Rubber` and `Ball`.
They all extend [`Item`](item.ts).

- `IRenderable<STATE>` is for table elements that are rendered on the playfield
- `IHittable` means the ball can collide with it
- `IMovable` indicates there is some physically-based movement
- `IAnimatable` indicates the item somehow animates
- `IPlayable` is implemented for logic during game play
- `IScriptable` means the item offers a VBScript API

The difference between `IMovable` and `IAnimatable` is subtle: While `IMovable` 
computes its state on the physics loop and thus has a somewhat real-world based
behavior, `IAnimatable`s are only updated once every frame.

## Helper Classes

Some helpers exist for every item, others only for a few.

### Data Classes

These keep the properties of the `.vpx` file and know how to read them. They
are *usually* read-only: changes during gameplay are reflected elsewhere,
with a few exceptions.

Most other helpers rely on data classes. All data classes except `BallData`
(which isn't persisted) extend [`ItemData`](item-data.ts).

### States

States contain the *visible state* of a table element, i.e. changes the
renderer must take into account: position for movables, plus visibility,
material, and textures, which can also change during gameplay. They all
extend [`ItemState`](item-state.ts).

States are updated directly in the physics loop or via the script API. The
`Player` class returns the states changed since the last retrieval.

Since the state changes in the worker thread and needs to be passed to the main
thread, the transfer object only contains the changed values of the state.

### APIs

API helpers expose the item's Visual Pinball API (editor and VBScript)
without leaking internals.

Playfield items with an API implement `IScriptable`. The returned API class
extends [`ItemApi`](item-api.ts).

### Mesh Generators

Mesh generators provide 3D meshes of the playfield item based on their 
parameters, i.e. their data. They are usually only used when the table is loaded
and the 3D model is created.

Mesh generators are called within the main class implementing `IRenderable`. 
Their interface isn't defined, but they usually return a left-handed version
of `IRenderable`'s `getMeshes()`.

### Hit Generators

Hit generators create the hit shapes that make the ball collide with the table
item. The generated shapes are a collection of generic hit objects like circle,
line, triangle or point.

The `IHittable` interface requires a `getHitShapes()` method, which a hit 
generator provides.

### Hits

Hits or hit objects are item-specific hit shapes. Contrarily to hit generators,
they provide an instance of their own type. It is however possible to mix both,
for example the spinner has both its own hit object for dealing with the moving
plate, as well as a hit generator for the socket.

### Movers

Movers are created within the hit object of items implementing `IMovable`:
 
- Calculate the item's transformation and velocity on each physics cycle
- Provide additional parameters to the hit object's collision calculations
- Read and update the state depending on the above
   
So movers sit deeply in the physics loop, but they can also interact with the
outside. For example, for moving a flipper, the flipper API would provide a
`RotateToEnd()` method which would set the solenoid state of the mover to
`true`, which results in building up the acceleration of the flipper through the
mover, which results in the flipper's `angle` state to change and hence the 
renderer applying a different rotation matrix on the object.
 
### Animations

Animation helpers are the "dumb" version of movers: a static sequence of
transformations computed once per frame (usually just a state parameter
changing).

Animation helpers are created by classes which implement `IAnimatable`.

### Updaters

Updaters receive a new state and apply it to the renderer. They usually update 
the object's transformation, as well as visibility, material and textures. 
Sometimes but rarely, they also update the mesh geometry.

In order to do that, they use a provided render adapter which applies the
changes to the scene.

## Table Core

### Loader flow

`Table.load()` (`table/table.ts:98-102`) runs `TableLoader.load()`
(`table/table-loader.ts:38-69`), which fills a `LoadedTable`: one array per
`ITEM_REGISTRY` key (`item-registry.ts:40-63`), plus `items[name]` for every
game item and collection. The `Table` constructor then converts each array
into a name-keyed dict (`flippers`, `lights`, …; `textBoxes` becomes
`textboxes`) via `populateFromLoaded` (`table/table.ts:118-143`).

### Script execution

The VBScript source rides along in the `CODE` tag (see
[`lib/io/README.md`](../io/README.md)) and is decoded when `loadTableScript`
is set. `Player.init()`/`initAsync()` calls `Table.runTableScript[Async]()`,
which runs `new Transpiler(table, player).execute[Async](script)`
(`table/table.ts:330-350`, `../game/player.ts:58-84`).

### Material and texture resolution

Materials live on `TableData.materials` (parsed from the `MATE`/`PHMA`
tags). `Table.getMaterial()` tries an exact match, then case-insensitive
(`table/table.ts:151-157`). Textures are keyed lowercase by name;
`Table.getTexture()` looks them up (`table/table.ts:148-150`) while image
bytes stream lazily via `table.streamStorage` (`texture.ts:80-82`). Items
resolve both when building meshes in `getMeshes()`. (`mesh-loader.ts` is
unrelated: it only serves built-in static JSON meshes.)

### Units and coordinates

Table geometry stays in VP units until the scene root: 1 unit = 0.53975mm
(`../physics/constants.ts:24`); the renderer applies `SCALE = 0.05` once
(`../render/threejs/three-render-api.ts:39`). The playfield plane is XY at
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

`rampType` is an int: flat = 0, 4-wire = 1, 2-wire = 2, 3-wire-left = 3,
3-wire-right = 4, 1-wire = 5 (`enums.ts:118-123`). A *habitrail* is any
non-flat wire type (`isHabitrail()`, `ramp/ramp-view.ts:413`): an elevated
wire track, meshed as tubes sized by `wireDiameter`/`wireDistanceX`/
`wireDistanceY` instead of a solid surface. Ramps have separate visible wall
heights (`leftWallHeightVisible`/`rightWallHeightVisible`).

### Walls: physics vs visible heights

`SurfaceData.heightBottom` (default 0) / `heightTop` (default 50) drive
*both* the collision polys and the visible mesh (`surface/surface.ts:74-75`,
`surface/surface-view.ts:23-24`) — there are no separate visible heights.
Use `isTopBottomVisible`/`isSideVisible` to hide faces instead.

### Spinners: angle units and axes

Data angles (`angleMin`/`angleMax`/`rotation`) are in degrees; the mover
converts to radians (`spinner/spinner-mover.ts:25-26`). The plate spins
about the X axis (`spinner/spinner-updater.ts:33`) on top of the base
`rotation` about Z.

### Drag points: `fSmooth` and `fSlingshot`

Each drag point (`dragpoint.ts:23-24`) carries two flags: `fSmooth` enables
Catmull-Rom smoothing through that control point; `fSlingshot` turns the
segment into a kicking `LineSegSlingshot` instead of a plain wall segment
(`surface/surface-physics.ts:61-71`).

### Flashers: support matrix

Parsed and scriptable; rendering is partial:

| Feature | Status |
|---|---|
| `Filter` / `FilterAmount` | Parsed, not rendered (no custom shader; `flasher/flasher-data.ts:60`) |
| `szImageB` | Parsed, only ImageA is drawn (`flasher/flasher-data.ts:50`) |
| Absorb blend mode | Renders as plain additive (`flasher/flasher.ts:65`) |
| `isDMD` | Parsed; skips the polygon mesh (`flasher/flasher-data.ts:55`) |
| Runtime rotation/height | Supported; updater rebakes the mesh (`flasher/flasher-updater.ts:64`) |

### Lights: glow vs surface vs bulb, fader modes

Which mesh a light builds depends on its flags (`light/light.ts:136-161`):
a bulb mesh (`showBulbMesh` + `meshRadius`), a bulb glow polygon (`bulbLight`
+ 3 or more drag points), a playfield-surface insert (neither, + drag
points), or a backglass light (`isBackglass`). `fader` (default Linear = 1)
selects the brightness envelope: None = 0, Linear = 1, Incandescent = 2
(`enums.ts:273-275`); Incandescent runs a filament-temperature simulation
(`light/light-physics.ts:86-88`).

### Light sequencers

`LightSeq.Play()` is implemented: `lightseq/lightseq-animation.ts` runs a
100-entry animation queue (`play()`, `:204-238`) over a grid of the
collection's lights/flashers/primitives, firing `PlayDone` when done.

### DispReel

A DispReel is an electromechanical score reel (the `Reel` object in VBS):
one spinning digit drum per reel, with `reelCount`, `reelSpacing`,
`motorSteps`, `digitRange`, and optional image-grid digits
(`dispreel/dispreel.ts:26-100`). Script ops (`AddValue`, `SetValue`,
`SpinReel`, `ResetToZero`) run through `DispReelAnimation` (`:229-238`).

### `SizingType`, DMD, transparency

- `SizingType` exists only on decals: AutoSize = 0, AutoWidth = 1,
  ManualSize = 2 (`enums.ts:471-473`).
- `isDMD` (dot-matrix-display rendering) is on textbox and flasher data.
- `isTransparent` is on textbox and dispreel data.

### Collections: `fireEvents` / `stopSingleEvents`

A collection groups item APIs under one name with group events and
`Count`/`Item(i)` access (`collection/collection.ts:50-120`). `fireEvents`
(`EVNT` tag) lets the group fire shared events; `stopSingleEvents` (`SSNG`
tag) suppresses the members' individual events (`:17-26`). Members are wired
in `Table.setupCollections` (`table/table.ts:367-383`).

### `TimerMode`

`Update` = 0 (1000Hz update cycle), `OnNewFrame` = -1, `OnGameSync` = -2,
`TIMER_DISABLED` = 0xffffffff (`timer/timer-const.ts:15-21`). `TimerData`
itself holds only the editor center; interval/enabled live on `data.timer`
(`timer/timer.ts:27` + `:74-85`).

### Plunger: the `PlungerDesc` lathe

`PlungerDesc` (`plunger/plunger-desc.ts:10-14`) is the plunger's lathe
profile: a list of (offset, diameter) coordinates revolved around the shaft
axis by the mesh generator (`plunger/plunger-mesh-generator.ts:34-56`).
`getModern()` returns 7 fixed coordinates, `getFlat()` is empty, and
`getCustom()` parses the `szTipShape` string plus rod/ring/spring params.

### Small-family `Data` classes

- `TimerData` (`timer/timer.ts:27`) — editor center only, plus the common
  timer block.
- `TextboxData` (`textbox/textbox.ts:23`) — text rectangle, text, colors,
  alignment, `isTransparent`/`isDMD`.
- `DecalData` (`decal/decal.ts:24`) — center/size/rotation, image-or-text
  (`decalType`), `sizingType`, target surface, material.
- `DispReelData` (`dispreel/dispreel.ts:26`) — reel geometry, count, spacing,
  motor steps, digit range, image and sound.
- `CollectionData` (`collection/collection.ts:22`) — member `itemNames` plus
  `fireEvents`/`groupElements`/`stopSingleEvents`.
