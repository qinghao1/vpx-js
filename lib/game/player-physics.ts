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
import { now } from '../refs.node.js'
import { degToRad } from '../util/float.js'
import { Vertex3D } from '../util/math.js'
import { Ball } from '../vpt/ball/ball.js'
import { BallData } from '../vpt/ball/ball-data.js'
import { BallState } from '../vpt/ball/ball-state.js'
import type { FlipperMover } from '../vpt/flipper/flipper-mover.js'
import type { Table } from '../vpt/table/table.js'
import { MAX_TIMERS_MSEC_OVERALL } from '../vpt/timer/timer-const.js'
import type { TimerHit } from '../vpt/timer/timer-hit.js'
import type { TimerOnOff } from '../vpt/timer/timer-on-off.js'
import { Event } from './event.js'
import type { IEmulator } from './iemulator.js'
import type { PinInput } from './pin-input.js'
import type { IBallCreationPosition, Player } from './player.js'

const SLOW_MO = 1

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
	public readonly changedHitTimers: TimerOnOff[] = []
	public emu?: IEmulator

	private readonly movers: MoverObject[] = []
	private readonly flipperMovers: FlipperMover[] = []
	private readonly hitObjects: HitObject[] = []
	private readonly hitObjectsDynamic: HitObject[] = []
	private hitPlayfield!: HitPlane
	private hitTopGlass!: HitPlane
	private meshAsPlayfield = false
	private hitOcTreeDynamic = new HitKD()
	private hitOcTree = new HitQuadtree()
	private hitTimers: TimerHit[] = []
	private minPhysLoopTime = 0
	private lastFlipTime = 0
	private lastTimeUsec = 0
	private lastFrameDuration = 0
	private cFrames = 0
	private lastFpsTime = 0
	private fps = 0
	private fpsAvg = 0
	private fpsCount = 0
	private curPhysicsFrameTime = 0
	private nextPhysicsFrameTime = 0
	private startTimeUsec = 0
	private physPeriod = 0
	private activeBallDebug?: Ball
	private scriptPeriod = 0

	constructor(
		private readonly table: Table,
		private readonly pinInput: PinInput,
	) {}

	public init(): void {
		const d = this.table.data!
		const slope = d.overridePhysics
			? DEFAULT_TABLE_MIN_SLOPE + (DEFAULT_TABLE_MAX_SLOPE - DEFAULT_TABLE_MIN_SLOPE) * d.globalDifficulty!
			: d.angletiltMin! + (d.angleTiltMax! - d.angletiltMin!) * d.globalDifficulty!
		const g = d.overridePhysics ? DEFAULT_TABLE_GRAVITY : d.gravity
		this.setGravity(slope, g)
		for (const a of this.table.getAnimatables()) a.getAnimation().init(this.timeMsec)
		this.indexTableElements()
		this.initOcTree(this.table)
	}

	private indexTableElements(): void {
		for (const m of this.table.getMovables()) this.movers.push(m.getMover())
		for (const h of this.table.getHittables())
			for (const o of h.getHitShapes()) {
				this.hitObjects.push(o)
				o.calcHitBBox()
			}
		for (const s of this.table.getScriptables()) this.hitTimers.push(...s.getApi()._getTimers())
		this.hitObjects.push(...this.table.getHitShapes())
		this.hitPlayfield = this.table.generatePlayfieldHit()
		this.hitTopGlass = this.table.generateGlassHit()
		for (const f of Object.values(this.table.flippers)) this.flipperMovers.push(f.getMover())
	}

	private initOcTree(table: Table): void {
		for (const o of this.hitObjects) this.hitOcTree.addElement(o)
		this.hitOcTree.initialize(table.getBoundingBox())
		this.hitOcTreeDynamic.fillFromVector(this.hitObjectsDynamic)
	}

	public physicsSimulateCycle(dTime: number): void {
		let staticCnts = STATICCNTS
		this.hitOcTreeDynamic.update()
		while (dTime > 0) {
			let hitTime = dTime
			for (const f of this.flipperMovers) {
				const t = f.getHitTime()
				if (t > 0 && t < hitTime) hitTime = t
			}
			this.recordContacts = true
			this.contacts.length = 0
			for (const ball of this.balls) {
				if (ball.state.isFrozen) continue
				ball.hit.coll.hitTime = hitTime
				ball.hit.coll.clear()
				if (!this.meshAsPlayfield) this.hitPlayfield.doHitTest(ball, ball.coll, this)
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
			this.recordContacts = false
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
					this.contacts[i]!.obj!.contact(this.contacts[i]!, hitTime, this)
			} else {
				for (const c of this.contacts) c.obj!.contact(c, hitTime, this)
			}
			for (const c of this.contacts) CollisionEvent.release(c)
			this.contacts.length = 0
			dTime -= hitTime
			this.swapBallCollisionHandling = !this.swapBallCollisionHandling
		}
	}

	/** Advances physics to `time` (ms). Returns iterations run. */
	public updatePhysics(time?: number): number {
		const initial = time !== undefined ? time * 1000 : Math.floor(this.now() * 1000)
		if (this.ensureInitialTime(initial)) return 0
		if (this.isPaused) {
			const delta = initial - this.curPhysicsFrameTime
			this.startTimeUsec += delta
			this.nextPhysicsFrameTime += delta
			this.curPhysicsFrameTime = initial
		}
		this.lastFrameDuration = initial - this.lastTimeUsec
		if (this.lastFrameDuration > 1_000_000) this.lastFrameDuration = 0
		this.lastTimeUsec = initial
		this.cFrames++
		if (this.timeMsec - this.lastFpsTime > 1000) {
			this.fps = (this.cFrames * 1000) / (this.timeMsec - this.lastFpsTime)
			this.lastFpsTime = this.timeMsec
			this.fpsAvg += this.fps
			this.fpsCount++
			this.cFrames = 0
		}
		this.scriptPeriod = 0
		let iterations = 0
		while (this.curPhysicsFrameTime < initial) {
			this.timeMsec = (this.curPhysicsFrameTime - this.startTimeUsec) / 1000
			iterations++
			const dt = (this.nextPhysicsFrameTime - this.curPhysicsFrameTime) * (1 / DEFAULT_STEPTIME)
			const curUsec = this.now()
			this.pinInput.processKeys()
			this.flushTimers()
			const oldBall = this.activeBall
			this.activeBall = undefined
			if (this.scriptPeriod <= 1000 * MAX_TIMERS_MSEC_OVERALL) {
				const cur = (this.curPhysicsFrameTime - this.startTimeUsec) / 1000
				for (const t of this.hitTimers)
					if ((t.interval >= 0 && t.nextFire <= cur) || t.interval < 0) {
						const prev = t.nextFire
						t.pfe.fireGroupEvent(Event.TimerEventsTimer)
						if (prev === t.nextFire) t.nextFire += t.interval
					}
				this.scriptPeriod += Math.floor(this.now() - curUsec)
			}
			this.activeBall = oldBall
			if (this.emu) this.emu.emuSimulateCycle(dt * 10)
			this.updateVelocities()
			this.physicsSimulateCycle(dt)
			this.curPhysicsFrameTime = this.nextPhysicsFrameTime
			this.nextPhysicsFrameTime += PHYSICS_STEPTIME
		}
		this.physPeriod = Math.floor(this.now() * 1000) - initial
		return iterations
	}

	private ensureInitialTime(initial: number): boolean {
		if (this.curPhysicsFrameTime !== 0 || this.nextPhysicsFrameTime !== 0 || this.startTimeUsec !== 0) return false
		if (initial > 100000) {
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
		const data = new BallData(radius, mass, this.table.data!.defaultBulbIntensityScaleOnBall)
		const id = Ball.idCounter++
		const state = BallState.claim(`Ball\${id}`, ballCreator.getBallCreationPosition(this.table))
		state.pos.z += data.radius
		const ball = new Ball(id, data, state, ballCreator.getBallCreationVelocity(this.table), player, this.table)
		ballCreator.onBallCreated(this, ball)
		this.balls.push(ball)
		this.movers.push(ball.getMover())
		this.hitObjectsDynamic.push(ball.hit)
		this.hitOcTreeDynamic.fillFromVector(this.hitObjectsDynamic)
		return ball
	}

	public destroyBall(ball: Ball): void {
		if (!ball) return
		const wasActive = this.activeBallBC === ball
		const wasDebug = this.activeBallDebug === ball
		if (wasActive) this.activeBall = undefined
		if (wasDebug) this.activeBallDebug = undefined
		if (this.activeBallBC === ball) this.activeBallBC = undefined
		this.balls.splice(this.balls.indexOf(ball), 1)
		this.movers.splice(this.movers.indexOf(ball.getMover()), 1)
		this.hitObjectsDynamic.splice(this.hitObjectsDynamic.indexOf(ball.hit), 1)
		this.hitOcTreeDynamic.fillFromVector(this.hitObjectsDynamic)
		if (wasDebug && this.balls.length) this.activeBallDebug = this.balls[0]
		if (wasActive && this.balls.length) this.activeBall = this.balls[0]
	}

	private now(): number {
		return now() * SLOW_MO
	}

	public setGravity(slopeDeg: number, strength: number): void {
		this.gravity.x = 0
		this.gravity.y = Math.sin(degToRad(slopeDeg)) * strength
		this.gravity.z = -Math.cos(degToRad(slopeDeg)) * strength
	}
}
