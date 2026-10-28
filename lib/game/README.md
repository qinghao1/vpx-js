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

## Physics constants (upstream `PhysicsEngine.cpp`, `physconst.h`)

- `STATICTIME = 0.02`, `STATICCNTS = 10`: a collision pass may reuse a hit
  time below 0.02 at most 10 times before it is clamped to 0.02, so resting
  contact terminates instead of looping on ever-smaller hit times.
- Wall-clock catch-up is capped at `MAX_CATCHUP_USEC = 50` physics steps
  (`16` on low-quality devices); explicit-time callers always run full
  catch-up like upstream. Low-quality also stops an explicit-time burst after
  `MAX_ITER_LOW = 16` steps and fast-forwards the clocks.
- Script-timer budget: `MAX_TIMERS_MSEC_OVERALL = 5` caps wall-clock script
  time per frame (upstream anti-spiral guard); explicit-time callers always
  fire so headless sims stay deterministic.

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

Key codes are DirectInput scancodes (upstream `InputManager.cpp`), not DOM
values: `key-code.ts` maps the layout-independent physical
`KeyboardEvent.code` first (shifted punctuation and non-US layouts keep
working) and falls back to the lowercase `key` name for events without `code`.
Left/right Shift are disambiguated by `code` (`ShiftLeft`/`ShiftRight`); only
the legacy no-`code` path uses `location`/`keyLocation` (`2` = right).
Free-play helpers (auto-credits, Start coin pulses, mock trough eject) are
vpx-js-only — none exists upstream — and default on via the static
`PinInput.freePlayDefault` (set false before constructing the `Player` to
disable). All free-play scheduling runs on the physics clock, so pausing the
game pauses it.

