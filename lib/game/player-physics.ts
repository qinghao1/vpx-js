// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { type Vertex2D, Vertex3D } from '../math/vector.js'
import { CollisionEvent } from '../physics/collision-event.js'
import {
	C_CONTACTVEL,
	C_LOWNORMVEL,
	DEFAULT_BALL_SIZE,
	DEFAULT_STEPTIME,
	DEFAULT_TABLE_GRAVITY,
	DEFAULT_TABLE_MAX_SLOPE,
	DEFAULT_TABLE_MIN_SLOPE,
	PHYS_TOUCH,
	PHYSICS_STEPTIME,
	STATICCNTS,
	STATICTIME,
} from '../physics/constants.js'
import { HitKD } from '../physics/hit-kd.js'
import type { HitObject } from '../physics/hit-object.js'
import type { HitPlane } from '../physics/hit-plane.js'
import { HitQuadtree } from '../physics/hit-quadtree.js'
import type { MoverObject } from '../physics/mover-object.js'
import { logger } from '../util/logger.js'
import { isLowQuality } from '../util/quality.js'
import { Ball } from '../vpt/ball/ball.js'
import { BallData } from '../vpt/ball/ball-data.js'
import { BallHit } from '../vpt/ball/ball-hit.js'
import { BallState } from '../vpt/ball/ball-state.js'
import type { FlipperMover } from '../vpt/flipper/flipper-mover.js'
import type { Table } from '../vpt/table/table.js'
import {
	MAX_TIMER_MSEC_INTERVAL,
	MAX_TIMERS_MSEC_OVERALL,
	TIMER_DISABLED,
	TimerMode,
} from '../vpt/timer/timer-const.js'
import type { TimerHit } from '../vpt/timer/timer-hit.js'
import { TimerOnOff } from '../vpt/timer/timer-on-off.js'
import { Event } from './event.js'
import type { IEmulator } from './iemulator.js'
import type { PinInput } from './pin-input.js'
import type { IBallCreationPosition, Player } from './player.js'

const CLOCK_INIT_THRESHOLD_USEC = 1_000_000
// Divergence: upstream has no backlog clamp (its 200 ms is an in-loop anti-hang
// guard, PhysicsEngine.cpp). vpx-js caps catch-up per wall-clock frame instead.
const MAX_CATCHUP_USEC = 50 * PHYSICS_STEPTIME
const MAX_CATCHUP_USEC_LOW = 16 * PHYSICS_STEPTIME
const MAX_ITER_LOW = 16
// Reminder cadence for a persistently throwing timer: first throw warns,
// repeats remind at most this often (game time) so a broken fast timer
// cannot spam the log forever, yet repeat failures stay visible.
const TIMER_WARN_INTERVAL_MSEC = 5_000

/** Core physics loop — 1 kHz collision, timers, movers.
 * @see https://github.com/vpinball/vpinball/blob/master/src/physics/PhysicsEngine.cpp (PhysicsEngine::UpdatePhysics) */
export class PlayerPhysics {
	public readonly balls: Ball[] = []
	public gravity = new Vertex3D()
	// Slope frame for the BallMover nudge path; derived in setGravity (only writer).
	public gravityMag = 1
	// -0 matches hypot(0,0)||1 before the first setGravity call.
	public gravityCosSlope = -0
	public gravitySinSlope = 0
	public timeMsec = 0
	public recordContacts = false
	public contacts: CollisionEvent[] = []
	public activeBall?: Ball
	public activeBallBC?: Ball
	// Divergence: upstream randomizes hit-test/contact order per ball and substep
	// (PhysicsEngine.cpp); the port drives all three from this toggle so physics
	// stays reproducible. Do not "fix" with Math.random().
	public swapBallCollisionHandling = false
	public lastPlungerHit = 0
	public ballControl = false
	public bcTarget?: Vertex3D
	public isPaused = false
	public disablePhysics = false
	public readonly changedHitTimers: TimerOnOff[] = []
	public emu?: IEmulator

	private readonly movers: MoverObject[] = []
	private readonly flipperMovers: FlipperMover[] = []
	private readonly hitObjects: HitObject[] = []
	private readonly hitObjectsDynamic: HitObject[] = []
	private hitPlayfield!: HitPlane
	private hitTopGlass!: HitPlane
	private hitOcTreeDynamic = new HitKD()
	private hitOcTree = new HitQuadtree()
	private hitTimers: TimerHit[] = []
	private readonly lastTimerWarnAt = new WeakMap<TimerHit, number>()
	private lastTimeUsec = 0
	private lastFrameDuration = 0
	private cFrames = 0
	private lastFpsTime = 0
	public fps = 0
	private curPhysicsFrameTime = 0
	private nextPhysicsFrameTime = 0
	private startTimeUsec = 0
	private activeBallDebug?: Ball
	private scriptPeriod = 0
	private deferTimerChanges = false
	private emuAccumMs = 0

	constructor(
		private readonly table: Table,
		private readonly pinInput: PinInput,
	) {}

	public getCabinetAcceleration(): Vertex2D {
		return this.pinInput.getCabinetAcceleration()
	}
	public getCabinetOffset(): Vertex2D {
		return this.pinInput.getCabinetOffset()
	}

	public init(): void {
		const d = this.table.data!
		const difficulty = d.globalDifficulty ?? 0.2
		const slope = d.overridePhysics
			? DEFAULT_TABLE_MIN_SLOPE + (DEFAULT_TABLE_MAX_SLOPE - DEFAULT_TABLE_MIN_SLOPE) * difficulty
			: (d.angletiltMin ?? DEFAULT_TABLE_MIN_SLOPE) +
				((d.angleTiltMax ?? DEFAULT_TABLE_MAX_SLOPE) - (d.angletiltMin ?? DEFAULT_TABLE_MIN_SLOPE)) * difficulty
		const g = d.overridePhysics ? DEFAULT_TABLE_GRAVITY : (d.gravity ?? DEFAULT_TABLE_GRAVITY)
		this.setGravity(slope, g)
		for (const a of this.table.getAnimatables()) a.getAnimation().init(this.timeMsec)
		this.indexTableElements()
		this.initOcTree(this.table)
	}

	private indexTableElements(): void {
		this.movers.push(...this.table.getMovables().map(m => m.getMover()))
		for (const h of this.table.getHittables()) {
			for (const o of h.getHitShapes()) {
				this.hitObjects.push(o)
				o.calcHitBBox()
			}
		}
		this.hitTimers.push(...this.table.getScriptables().flatMap(s => s.getApi()._getTimers()))
		this.hitObjects.push(...this.table.getHitShapes())
		this.hitPlayfield = this.table.generatePlayfieldHit()
		this.hitTopGlass = this.table.generateGlassHit()
		this.flipperMovers.push(...Object.values(this.table.flippers).map(f => f.getMover()))
	}

	private initOcTree(table: Table): void {
		for (const o of this.hitObjects) this.hitOcTree.addElement(o)
		this.hitOcTree.initialize(table.getBoundingBox())
		this.hitOcTreeDynamic.fillFromVector(this.hitObjectsDynamic, true)
	}

	// Claim-free reject for the two unconditional static-plane tests: every early-out
	// below matches a `return -1` in HitPlane.hitTest, so skipping doHitTest changes
	// nothing but a pooled claim/release.
	private isPlaneGuaranteedMiss(plane: HitPlane, ball: Ball): boolean {
		if (!plane.isEnabled) return true
		const normal = plane.normal
		const vel = ball.hit.vel
		const bnv = normal.x * vel.x + normal.y * vel.y + normal.z * vel.z
		if (bnv > C_CONTACTVEL) return true
		const pos = ball.state.pos
		const radius = ball.data.radius
		const bnd = normal.x * pos.x + normal.y * pos.y + normal.z * pos.z - radius - plane.d
		if (bnd < radius * -2) return true
		if (bnd <= PHYS_TOUCH) return false
		return Math.abs(bnv) <= C_LOWNORMVEL
	}

	public physicsSimulateCycle(dTime: number): void {
		if (!this.hitPlayfield || !this.hitTopGlass) return
		let staticCnts = STATICCNTS
		this.hitOcTreeDynamic.update()
		while (dTime > 0) {
			let hitTime = dTime
			for (let i = 0; i < this.flipperMovers.length; i++) {
				const t = this.flipperMovers[i]!.getHitTime()
				if (Number.isFinite(t) && t > 0 && t <= hitTime) hitTime = t
			}
			this.recordContacts = true
			this.contacts.length = 0
			try {
				for (let i = 0; i < this.balls.length; i++) {
					const ball = this.balls[i]!
					if (ball.state.isFrozen) continue
					ball.coll.clear()
					ball.coll.hitTime = hitTime
					// Static planes are tested unconditionally per ball per iteration; skip the
					// pooled claim/release on guaranteed misses (exact mirror of HitPlane.hitTest).
					if (!this.isPlaneGuaranteedMiss(this.hitPlayfield, ball))
						this.hitPlayfield.doHitTest(ball, ball.coll, this)
					if (!this.isPlaneGuaranteedMiss(this.hitTopGlass, ball))
						this.hitTopGlass.doHitTest(ball, ball.coll, this)
					if (this.swapBallCollisionHandling) {
						this.hitOcTreeDynamic.hitTestBall(ball, ball.coll, this)
						this.hitOcTree.hitTestBall(ball, ball.coll, this)
					} else {
						this.hitOcTree.hitTestBall(ball, ball.coll, this)
						this.hitOcTreeDynamic.hitTestBall(ball, ball.coll, this)
					}
					const htz = ball.coll.hitTime
					if (htz < 0) ball.coll.clear()
					if (ball.coll.obj && htz <= hitTime) {
						hitTime = htz
						if (htz < STATICTIME && --staticCnts < 0) {
							staticCnts = 0
							hitTime = STATICTIME
						}
					}
				}
			} finally {
				this.recordContacts = false
			}
			if (hitTime > STATICTIME) staticCnts = STATICCNTS
			for (let i = 0; i < this.movers.length; i++) this.movers[i]!.updateDisplacements(hitTime)
			// A throwing collide/contact must not leak pooled contacts: the release
			// loop below is the only return path to the pool, and the next cycle's
			// `contacts.length = 0` reset drops entries without releasing them.
			try {
				for (let i = 0; i < this.balls.length; i++) {
					const ball = this.balls[i]!
					const pho = ball.coll.obj
					if (pho && ball.coll.hitTime <= hitTime) {
						this.activeBall = ball
						pho.collide(ball.coll, this)
						ball.coll.clear()
						if (this.balls[i] !== ball) --i
						else ball.hit.calcHitBBox()
					}
				}
				// FIX_PHYSICS (PhysicsEngine.cpp): ball/ball contacts first, then static
				// ones — each contact cancels what the earlier ones applied to its ball,
				// so a ball pressed against another ball or a wall cannot climb off.
				// Deliberate divergence: traversal direction alternates deterministically
				// each cycle; upstream picks it randomly per cycle (rand_mt_01).
				for (let i = 0; i < this.balls.length; i++) this.balls[i]!.hit.contactDeltaV.set(0, 0, 0)
				const lastContact = this.contacts.length - 1
				for (let pass = 0; pass < 2; pass++) {
					for (let index = 0; index < this.contacts.length; index++) {
						const contact = this.contacts[this.swapBallCollisionHandling ? lastContact - index : index]!
						const isBallContact = contact.obj instanceof BallHit
						if (isBallContact === (pass === 0)) contact.obj?.contact(contact, hitTime, this)
					}
				}
			} finally {
				for (let i = 0; i < this.contacts.length; i++) CollisionEvent.releaseOne(this.contacts[i]!)
				this.contacts.length = 0
			}
			dTime = Math.max(0, dTime - hitTime)
			this.swapBallCollisionHandling = !this.swapBallCollisionHandling
		}
	}

	/**
	 * Advances physics to `time` (ms). Returns iterations run.
	 * @param time absolute physics-clock time in ms (not a delta); omitted follows the wall clock.
	 */
	public updatePhysics(time?: number): number {
		const initial = time !== undefined ? time * 1000 : Math.floor(this.now() * 1000)
		if (this.ensureInitialTime(initial, time)) return 0
		if (this.isPaused) {
			// Upstream PhysicsEngine only shifts forward (initial > cur): explicit
			// time going backwards while paused must not rewind the clocks.
			const delta = initial - this.curPhysicsFrameTime
			if (delta > 0) {
				this.startTimeUsec += delta
				this.nextPhysicsFrameTime += delta
				this.curPhysicsFrameTime = initial
			}
		}
		const catchUpMax = isLowQuality() ? MAX_CATCHUP_USEC_LOW : MAX_CATCHUP_USEC
		if (time === undefined && initial - this.curPhysicsFrameTime > catchUpMax) {
			const drift = initial - this.curPhysicsFrameTime - catchUpMax
			this.startTimeUsec += drift
			this.curPhysicsFrameTime += drift
			this.nextPhysicsFrameTime += drift
		}
		this.advanceFrameClock(initial)
		this.scriptPeriod = 0
		// Input is synchronous: the queue cannot refill mid-loop, so drain it once per
		// call instead of once per 1 ms substep. Gated on the loop running at all so
		// queued keys still wait while paused, exactly as before.
		if (this.nextPhysicsFrameTime <= initial) this.pinInput.processKeys()
		let iterations = 0
		// Divergence: upstream loops while `next < initial` (stays a step behind
		// the wall clock); the port uses `<=` so explicit-ms callers advance
		// exactly to the requested time. Pinned by the player.spec loop-bound specs.
		while (this.nextPhysicsFrameTime <= initial) {
			if (isLowQuality() && iterations >= MAX_ITER_LOW) {
				const drift = initial - this.curPhysicsFrameTime
				this.startTimeUsec += drift
				this.curPhysicsFrameTime = initial
				this.nextPhysicsFrameTime = initial + PHYSICS_STEPTIME
				break
			}
			this.timeMsec = Math.floor((this.curPhysicsFrameTime - this.startTimeUsec) / 1000)
			iterations++
			const dt = (this.nextPhysicsFrameTime - this.curPhysicsFrameTime) * (1 / DEFAULT_STEPTIME)
			const oldBall = this.activeBall
			this.activeBall = undefined
			// Upstream MAX_TIMERS_MSEC_OVERALL anti-spiral guard, wall-clock only:
			// explicit-time callers always fire so headless sims stay deterministic.
			// The clock reads are gated on having timers at all: with none,
			// fireTimers is a no-op and the pair is pure overhead.
			if (
				this.hitTimers.length > 0 &&
				(time !== undefined || this.scriptPeriod <= 1000 * MAX_TIMERS_MSEC_OVERALL)
			) {
				const t0 = performance.now()
				this.fireTimers(TimerMode.Update)
				this.scriptPeriod += Math.floor(performance.now() - t0)
			}
			this.activeBall = oldBall
			// One wasm round-trip per tick: accumulate here, flush once at the end.
			if (this.emu) this.emuAccumMs += dt * 10
			// Upstream order (PhysicsEngine::UpdatePhysics): step nudge before the
			// movers so BallMover reads this substep's cabinet acceleration.
			this.pinInput.tickNudge()
			if (!this.disablePhysics) {
				this.updateVelocities()
				this.physicsSimulateCycle(dt)
			}
			this.curPhysicsFrameTime = this.nextPhysicsFrameTime
			this.nextPhysicsFrameTime += PHYSICS_STEPTIME
		}
		this.flushEmu()
		this.timeMsec = Math.floor((initial - this.startTimeUsec) / 1000)
		// One call is one headless frame: -1 fires per call (even paused/repeated),
		// -2 per call while playing. Upstream splits these across Render/UpdateGameLogic.
		this.fireTimers(TimerMode.OnNewFrame)
		// Upstream fires -2 only while playing, but -1 on every frame incl. paused.
		if (!this.isPaused) this.fireTimers(TimerMode.OnGameSync)
		return iterations
	}

	/** Forwards the tick's whole accumulation in one call; totals exact, nothing carried. */
	private flushEmu(): void {
		const emu = this.emu
		if (emu && this.emuAccumMs > 0) {
			emu.emuSimulateCycle(this.emuAccumMs)
			this.emuAccumMs = 0
		}
	}

	private fireTimers(mode: TimerMode): void {
		this.deferTimerChanges = true
		try {
			if (mode === TimerMode.Update) {
				const cur = this.timeMsec
				for (let i = 0; i < this.hitTimers.length; i++) {
					const t = this.hitTimers[i]
					if (t.interval < 0) continue
					if (t.nextFire <= cur) {
						const prev = t.nextFire
						this.safeFire(t)
						if (prev === t.nextFire && t.interval > 0) {
							while (t.nextFire <= cur) t.nextFire += t.interval
						}
					}
				}
			} else {
				for (let i = 0; i < this.hitTimers.length; i++) {
					const t = this.hitTimers[i]!
					if (t.interval !== mode) continue
					this.safeFire(t)
				}
			}
		} finally {
			this.deferTimerChanges = false
			this.flushTimers()
		}
	}

	private safeFire(t: TimerHit): void {
		try {
			t.pfe.fireGroupEvent(Event.TimerEventsTimer)
		} catch (err) {
			// A table-script timer must not abort the tick: upstream FireDispID
			// ignores each sink's Invoke HRESULT and keeps looping
			// (src/utils/eventproxy.h); this try/catch is the port's equivalent,
			// and the nextFire advance in fireTimers still applies so a broken
			// timer cannot hot-loop.
			// Warn once per timer, then only a periodic reminder: a permanently
			// broken fast timer would otherwise log ~100 lines/sec forever.
			const last = this.lastTimerWarnAt.get(t)
			if (last === undefined || this.timeMsec - last >= TIMER_WARN_INTERVAL_MSEC) {
				this.lastTimerWarnAt.set(t, this.timeMsec)
				logger().warn('[PlayerPhysics] Timer handler threw; continuing.', err)
			}
		}
	}

	/** Single choke point for live interval writes: clamps, then reprograms. */
	public reprogramTimer(timer: TimerHit, interval: number): void {
		const clamped =
			interval >= 0 ? Math.max(interval, MAX_TIMER_MSEC_INTERVAL) : Math.max(TimerMode.OnGameSync, interval)
		timer.interval = clamped
		timer.nextFire = this.timeMsec + clamped
	}

	public timerStateChange(timer: TimerHit, enabled: boolean): void {
		if (this.deferTimerChanges) {
			if (enabled) timer.nextFire = this.timeMsec + timer.interval
			else timer.nextFire = TIMER_DISABLED
			const existing = this.changedHitTimers.find(c => c.timer === timer)
			if (existing) existing.enabled = enabled
			else this.changedHitTimers.push(new TimerOnOff(enabled, timer))
		} else if (enabled) {
			timer.nextFire = this.timeMsec + timer.interval
			this.upsertTimer(timer, true)
		} else {
			this.upsertTimer(timer, false)
			timer.nextFire = TIMER_DISABLED
		}
	}

	private upsertTimer(timer: TimerHit, enabled: boolean): void {
		const idx = this.hitTimers.indexOf(timer)
		if (enabled) {
			if (idx < 0) this.hitTimers.push(timer)
		} else if (idx >= 0) this.hitTimers.splice(idx, 1)
	}

	private ensureInitialTime(initial: number, time?: number): boolean {
		if (this.curPhysicsFrameTime !== 0 || this.nextPhysicsFrameTime !== 0 || this.startTimeUsec !== 0) return false
		if (time === undefined && initial > CLOCK_INIT_THRESHOLD_USEC) {
			this.curPhysicsFrameTime = initial
			this.nextPhysicsFrameTime = initial + PHYSICS_STEPTIME
			this.startTimeUsec = initial
			this.lastTimeUsec = initial
			return true
		}
		this.nextPhysicsFrameTime = PHYSICS_STEPTIME
		this.startTimeUsec = 0
		this.lastTimeUsec = initial
		return false
	}

	private flushTimers(): void {
		for (let i = 0; i < this.changedHitTimers.length; i++) {
			const c = this.changedHitTimers[i]!
			this.upsertTimer(c.timer, c.enabled)
		}
		this.changedHitTimers.length = 0
	}

	private advanceFrameClock(initial: number): void {
		this.lastFrameDuration = initial - this.lastTimeUsec
		if (this.lastFrameDuration > 1_000_000) this.lastFrameDuration = DEFAULT_STEPTIME
		this.lastTimeUsec = initial
		this.cFrames++
		if (this.timeMsec - this.lastFpsTime > 1000) {
			this.fps = (this.cFrames * 1000) / (this.timeMsec - this.lastFpsTime)
			this.lastFpsTime = this.timeMsec
			this.cFrames = 0
		}
	}

	public updateVelocities(): void {
		for (let i = 0; i < this.movers.length; i++) this.movers[i]!.updateVelocities(this)
	}

	public createBall(ballCreator: IBallCreationPosition, player: Player, radius = DEFAULT_BALL_SIZE, mass = 1): Ball {
		const data = new BallData(radius, mass, this.table.data?.defaultBulbIntensityScaleOnBall)
		const ballId = Ball.idCounter++
		const state = BallState.claim(`Ball${ballId}`, ballCreator.getBallCreationPosition(this.table))
		state.pos.z += data.radius
		const ball = new Ball(ballId, data, state, ballCreator.getBallCreationVelocity(this.table), player, this.table)
		ballCreator.onBallCreated(this, ball)
		this.balls.push(ball)
		this.movers.push(ball.getMover())
		this.hitObjectsDynamic.push(ball.hit)
		this.hitOcTreeDynamic.syncCounts(this.hitObjectsDynamic)
		return ball
	}

	public destroyBall(ball: Ball): void {
		if (!ball) return
		const wasActive = this.activeBall === ball
		const wasDebug = this.activeBallDebug === ball
		if (wasActive) this.activeBall = undefined
		if (wasDebug) this.activeBallDebug = undefined
		if (this.activeBallBC === ball) this.activeBallBC = undefined
		const bi = this.balls.indexOf(ball)
		if (bi >= 0) this.balls.splice(bi, 1)
		const mi = this.movers.indexOf(ball.getMover())
		if (mi >= 0) this.movers.splice(mi, 1)
		const hi = this.hitObjectsDynamic.indexOf(ball.hit)
		if (hi >= 0) this.hitObjectsDynamic.splice(hi, 1)
		this.hitOcTreeDynamic.syncCounts(this.hitObjectsDynamic)
		if (wasDebug && this.balls.length) this.activeBallDebug = this.balls[0]
		if (wasActive && this.balls.length) this.activeBall = this.balls[0]
	}

	private now(): number {
		return performance.now()
	}

	public setGravity(slopeDeg: number, strength: number): void {
		this.gravity.x = 0
		this.gravity.y = Math.sin((slopeDeg * Math.PI) / 180) * strength
		this.gravity.z = -Math.cos((slopeDeg * Math.PI) / 180) * strength
		this.gravityMag = Math.hypot(this.gravity.y, this.gravity.z) || 1
		this.gravityCosSlope = -this.gravity.z / this.gravityMag
		this.gravitySinSlope = this.gravity.y / this.gravityMag
	}
}
