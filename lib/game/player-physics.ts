// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { CollisionEvent } from '../physics/collision-event.js'
import {
	DEFAULT_STEPTIME,
	DEFAULT_TABLE_GRAVITY,
	DEFAULT_TABLE_MAX_SLOPE,
	DEFAULT_TABLE_MIN_SLOPE,
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
import { type Vertex2D, Vertex3D } from '../util/vector.js'
import { Ball } from '../vpt/ball/ball.js'
import { BallData } from '../vpt/ball/ball-data.js'
import { BallState } from '../vpt/ball/ball-state.js'
import type { FlipperMover } from '../vpt/flipper/flipper-mover.js'
import type { Table } from '../vpt/table/table.js'
import { MAX_TIMERS_MSEC_OVERALL, TIMER_DISABLED, TimerMode } from '../vpt/timer/timer-const.js'
import type { TimerHit } from '../vpt/timer/timer-hit.js'
import { TimerOnOff } from '../vpt/timer/timer-on-off.js'
import { Event } from './event.js'
import type { IEmulator } from './iemulator.js'
import type { PinInput } from './pin-input.js'
import type { IBallCreationPosition, Player } from './player.js'

const CLOCK_INIT_THRESHOLD_USEC = 1_000_000
const MAX_CATCHUP_USEC = 1000 * PHYSICS_STEPTIME

/** Core physics loop — 1 kHz collision, timers, movers.
 * @see https://github.com/vpinball/vpinball/blob/master/player.cpp */
export class PlayerPhysics {
	public readonly balls: Ball[] = []
	public gravity = new Vertex3D()
	public timeMsec = 0
	public recordContacts = false
	public contacts: CollisionEvent[] = []
	public activeBall?: Ball
	public activeBallBC?: Ball
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
		const difficulty = d.globalDifficulty ?? 0.5
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

	public physicsSimulateCycle(dTime: number): void {
		if (!this.hitPlayfield || !this.hitTopGlass) return
		let staticCnts = STATICCNTS
		this.hitOcTreeDynamic.update()
		while (dTime > 0) {
			let hitTime = dTime
			for (const f of this.flipperMovers) {
				const t = f.getHitTime()
				if (Number.isFinite(t) && t > 0 && t < hitTime) hitTime = t
			}
			hitTime = Number.isFinite(hitTime) && hitTime > 0 ? hitTime : Number.EPSILON
			this.recordContacts = true
			this.contacts.length = 0
			try {
				for (const ball of this.balls) {
					if (ball.state.isFrozen) continue
					ball.coll.clear()
					ball.coll.hitTime = hitTime
					this.hitPlayfield.doHitTest(ball, ball.coll, this)
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
			for (const m of this.movers) m.updateDisplacements(hitTime)
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
			if (this.swapBallCollisionHandling) {
				for (let i = this.contacts.length - 1; i >= 0; i--)
					this.contacts[i]?.obj?.contact(this.contacts[i]!, hitTime, this)
			} else {
				for (const c of this.contacts) c.obj?.contact(c, hitTime, this)
			}
			for (const c of this.contacts) CollisionEvent.releaseOne(c)
			this.contacts.length = 0
			dTime = Math.max(0, dTime - hitTime)
			this.swapBallCollisionHandling = !this.swapBallCollisionHandling
		}
	}

	/** Advances physics to `time` (ms). Returns iterations run. */
	public updatePhysics(time?: number): number {
		const initial = time !== undefined ? time * 1000 : Math.floor(this.now() * 1000)
		if (this.ensureInitialTime(initial, time)) return 0
		if (this.isPaused) {
			const delta = initial - this.curPhysicsFrameTime
			this.startTimeUsec += delta
			this.nextPhysicsFrameTime += delta
			this.curPhysicsFrameTime = initial
		}
		if (time === undefined && initial - this.curPhysicsFrameTime > MAX_CATCHUP_USEC) {
			const drift = initial - this.curPhysicsFrameTime - MAX_CATCHUP_USEC
			this.startTimeUsec += drift
			this.curPhysicsFrameTime += drift
			this.nextPhysicsFrameTime += drift
		}
		this.lastFrameDuration = initial - this.lastTimeUsec
		if (this.lastFrameDuration > 1_000_000) this.lastFrameDuration = DEFAULT_STEPTIME
		this.lastTimeUsec = initial
		this.cFrames++
		if (this.timeMsec - this.lastFpsTime > 1000) {
			this.fps = (this.cFrames * 1000) / (this.timeMsec - this.lastFpsTime)
			this.lastFpsTime = this.timeMsec
			this.cFrames = 0
		}
		this.scriptPeriod = 0
		let iterations = 0
		while (this.curPhysicsFrameTime < initial) {
			this.timeMsec = Math.floor((this.curPhysicsFrameTime - this.startTimeUsec) / 1000)
			iterations++
			const dt = (this.nextPhysicsFrameTime - this.curPhysicsFrameTime) * (1 / DEFAULT_STEPTIME)
			const t0 = performance.now()
			this.pinInput.processKeys()
			this.pinInput.tickNudge()
			const oldBall = this.activeBall
			this.activeBall = undefined
			if (this.scriptPeriod <= 1000 * MAX_TIMERS_MSEC_OVERALL) {
				this.fireTimers(TimerMode.Update)
				this.scriptPeriod += Math.floor(performance.now() - t0)
			}
			this.activeBall = oldBall
			if (this.emu) this.emu.emuSimulateCycle(dt * 10)
			if (!this.disablePhysics) {
				this.updateVelocities()
				this.physicsSimulateCycle(dt)
			}
			this.curPhysicsFrameTime = this.nextPhysicsFrameTime
			this.nextPhysicsFrameTime += PHYSICS_STEPTIME
		}
		this.timeMsec = Math.floor((initial - this.startTimeUsec) / 1000)
		this.fireTimers(TimerMode.OnNewFrame)
		this.fireTimers(TimerMode.OnGameSync)
		return iterations
	}

	private fireTimers(mode: TimerMode): void {
		this.deferTimerChanges = true
		try {
			if (mode === TimerMode.Update) {
				const cur = this.timeMsec
				for (const t of this.hitTimers) {
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
				for (const t of this.hitTimers) {
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
		} catch (e) {
			logger().warn('timer error %s', (e as Error).message)
		}
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
			if (!this.hitTimers.includes(timer)) this.hitTimers.push(timer)
		} else {
			const idx = this.hitTimers.indexOf(timer)
			if (idx >= 0) this.hitTimers.splice(idx, 1)
			timer.nextFire = TIMER_DISABLED
		}
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
		for (const c of this.changedHitTimers) {
			const idx = this.hitTimers.indexOf(c.timer)
			if (c.enabled) {
				if (idx < 0) this.hitTimers.push(c.timer)
			} else if (idx >= 0) this.hitTimers.splice(idx, 1)
		}
		this.changedHitTimers.length = 0
	}

	public updateVelocities(): void {
		for (const m of this.movers) m.updateVelocities(this)
	}

	public createBall(ballCreator: IBallCreationPosition, player: Player, radius = 25, mass = 1): Ball {
		const data = new BallData(radius, mass, this.table.data?.defaultBulbIntensityScaleOnBall)
		const id = Ball.idCounter++
		const state = BallState.claim(`Ball${id}`, ballCreator.getBallCreationPosition(this.table))
		state.pos.z += data.radius
		const ball = new Ball(id, data, state, ballCreator.getBallCreationVelocity(this.table), player, this.table)
		ballCreator.onBallCreated(this, ball)
		this.balls.push(ball)
		this.movers.push(ball.getMover())
		this.hitObjectsDynamic.push(ball.hit)
		this.hitOcTreeDynamic.fillFromVector(this.hitObjectsDynamic, true)
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
		this.hitOcTreeDynamic.fillFromVector(this.hitObjectsDynamic, true)
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
	}
}
