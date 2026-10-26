# lib/game — host-facing game controller

`Player` (`player.ts`) is the host's entry point: input, physics stepping,
animations, and state diffing. `PlayerPhysics` (`player-physics.ts`) owns the
simulation clock and the 1 kHz stepping loop; `PinInput` (`pin-input.ts`) owns
keys, nudge, and cabinet switches.

## Time model

Three clocks; do not mix them:

- Wall clock, **µs** (`curPhysicsFrameTime`, `nextPhysicsFrameTime`,
  `startTimeUsec` in `player-physics.ts`): the physics loop runs fixed
  `PHYSICS_STEPTIME = 1000` µs steps while `nextPhysicsFrameTime <= initial`.
- Game time, **ms** (`PlayerPhysics.timeMsec`): `floor((usec - startTimeUsec) /
  1000)`. Timers, animations, and script time all read this.
- VPT units: positions/velocities in table units (see `lib/vpt/README.md`).

`updatePhysics(timeMs?)` takes **absolute ms**, not a delta, and multiplies by
1000 internally. Passing a per-frame delta (e.g. `16`) re-simulates from the
epoch and silently advances nothing once the clock has passed it — always pass
a running total (see `simulateTime`, `test/harness/harness-gameplay.ts`).
Omitting the argument uses the real clock.

## Step rates: 1 kHz movers vs per-frame animations

- Movers (`IMovable`, e.g. flippers, gates) update inside every 1 ms physics
  step via `physicsSimulateCycle`.
- Animations (`IAnimatable`) update once per rendered frame via
  `updateAnimations(timeMs)` (called by `onFrame` and `simulateTime`).
- `simulateTime(endMs)` drives both at 60 Hz (`1000/60` ms increments) for
  headless tests; it is not the render loop.

## Dirty-state render protocol

`markDirty(name)` → `popStates()` → `ChangedStates`:

1. Mutating a script API (via the dirty-proxy in `wrapSingleApi`), moving a
   ball, or a changed animation marks the item dirty.
2. The host calls `popStates()` once per frame; it diffs dirty states against
   the previous snapshot and returns only what changed.
3. Every ~300 frames a full sweep re-adds all states as a safety net.

The host must `release()` the returned `ChangedStates`.

## Input path

`Player.onKeyDown/onKeyUp` (DOM event → DirectInput key via `key-code.ts`) →
`PinInput` queue → `processKeys()` drains the queue once per physics iteration
(`player-physics.ts`) → `TableApi.fireKeyEvent` script event plus
flipper/plunger/nudge/cabinet sync. Keys are level-triggered through the
`pressed` set, so draining per-iteration (not per-frame) keeps short taps from
being lost at low frame rates.

## Threaded physics (optional)

`shared/physics-buffer.ts` + `physics.worker.ts` run a second `PlayerPhysics`
off-thread (`WorkerSim`: real table and physics, no scripts/emu) and publish
ball frames through a `SharedArrayBuffer` triple buffer — see the header
comment in `physics-buffer.ts` for the layout and slot-rotation protocol.
`physics.worker.ts` is a full implementation, not a stub.
