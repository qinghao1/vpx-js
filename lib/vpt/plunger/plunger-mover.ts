// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import { AssignKey } from '../../game/key-code.js'
import type { Player } from '../../game/player.js'
import { HitLineZ } from '../../physics/hit-line-z.js'
import { LineSeg } from '../../physics/line-seg.js'
import type { MoverObject } from '../../physics/mover-object.js'
import { logger } from '../../util/logger.js'
import { Vertex2D } from '../../util/math.js'
import type { TableApi } from '../table/table-api.js'
import { Plunger, type PlungerConfig } from './plunger.js'
import type { PlungerData } from './plunger-data.js'
import type { PlungerState } from './plunger-state.js'

/** Plunger mover — simulates rod physics, mech tracking, and firing. */
export class PlungerMover implements MoverObject {
	private readonly data: PlungerData
	private readonly state: PlungerState
	private readonly events: EventProxy
	private readonly player: Player
	private readonly tableApi: TableApi

	/** Left/right/bottom position of on-screen plunger. */
	public readonly x: number
	public readonly x2: number
	public y: number

	public readonly lineSegBase = new LineSeg(new Vertex2D(0, 0), new Vertex2D(0, 0), 0, 0)
	public readonly lineSegEnd = new LineSeg(new Vertex2D(0, 0), new Vertex2D(0, 0), 0, 0)
	public readonly lineSegSide: LineSeg[] = [
		new LineSeg(new Vertex2D(0, 0), new Vertex2D(0, 0), 0, 0),
		new LineSeg(new Vertex2D(0, 0), new Vertex2D(0, 0), 0, 0),
	]
	public readonly jointBase: HitLineZ[] = [new HitLineZ(new Vertex2D(0, 0)), new HitLineZ(new Vertex2D(0, 0))]
	public readonly jointEnd: HitLineZ[] = [new HitLineZ(new Vertex2D(0, 0)), new HitLineZ(new Vertex2D(0, 0))]

	/** Current rod tip position (table units). */
	private _pos = 0

	/** Get rod position. */
	get pos(): number {
		return this._pos
	}
	set pos(v: number) {
		this._pos = v
		this.state.frame = this.getFrame()
	}

	/** Current rod speed (table units/s). */
	public speed = 0

	/** Forward travel limit for next displacement. */
	public travelLimit = 0

	/** Mass of moving parts — arbitrary scaling factor (see hitplunger.cpp). */
	public mass = 30

	/** Simulated pull force (non-zero = keyboard pull, ignores mech position). */
	private pullForce = 0

	/** Reverse impulse from ball hitting stationary plunger. */
	public reverseImpulse = 0

	/** Fire mode timer — when non-zero, plunger moves under spring force. */
	private fireTimer = 0

	/** Speed calculated at fire initiation. */
	private fireSpeed = 0

	/** Auto-plunger key-up timer. */
	private autoFireTimer = 0

	/** Bounce position (relative) for fire-mode oscillation. */
	public fireBounce = 0

	/** Rest position as fraction of range (park position or forward limit). */
	private readonly restPos: number
	public readonly frameStart: number
	public readonly frameEnd: number
	private readonly frameLen: number
	public readonly cFrames: number

	private fStrokeEventsArmed = false

	/** Recent mech readings for apex detection on release. */
	private mech0 = 0
	private mech1 = 0
	private mech2 = 0

	/** Scatter velocity for plunger-ball collision. */
	public scatterVelocity = 0

	constructor(
		config: PlungerConfig,
		data: PlungerData,
		state: PlungerState,
		events: EventProxy,
		player: Player,
		tableApi: TableApi,
	) {
		this.data = data
		this.state = state
		this.events = events
		this.player = player
		this.tableApi = tableApi
		this.x = config.x
		this.x2 = config.x2
		this.y = config.y
		this.frameEnd = config.frameTop
		this.frameStart = config.frameBottom
		this.frameLen = config.frameBottom - config.frameTop
		this.cFrames = config.cFrames
		this.travelLimit = config.frameTop
		this.scatterVelocity = data.scatterVelocity
		this.restPos = data.parkPosition
		this.pos = config.frameTop + this.restPos * this.frameLen

		const z0 = config.zHeight
		const z1 = config.zHeight + Plunger.PLUNGER_HEIGHT
		for (const s of [this.lineSegBase, ...this.lineSegSide, this.lineSegEnd]) s.setZ(z0, z1)
		for (const j of [...this.jointBase, ...this.jointEnd]) j.setZ(z0, z1)
		this.setObjects(this.pos)
	}

	public updateDisplacements(dTime: number): void {
		this.pos += dTime * this.speed
		if (this.pos < this.travelLimit) this.pos = this.travelLimit

		const relPos = (this.pos - this.frameEnd) / this.frameLen
		const bouncePos = this.restPos + this.fireBounce
		if (this.fireTimer !== 0 && dTime !== 0 && (this.fireSpeed < 0 ? relPos <= bouncePos : relPos >= bouncePos)) {
			this.pos = this.frameEnd + bouncePos * this.frameLen
			this.fireSpeed *= -0.4
			this.fireBounce *= -0.4
		}
		if (this.pos < this.travelLimit) this.pos = this.travelLimit

		if (dTime !== 0) {
			if (this.pos < this.frameEnd) {
				this.speed = 0
				this.pos = this.frameEnd
			} else if (this.pos > this.frameStart) {
				this.speed = 0
				this.pos = this.frameStart
			}
			if (this.pos < this.travelLimit) this.pos = this.travelLimit
		}
		this.travelLimit = this.frameEnd

		const dx = dTime * this.speed
		const limit = this.frameLen / 50
		const hysteresis = limit * 2
		if (this.fStrokeEventsArmed && this.pos + dx > this.frameStart - limit) {
			logger().info('[%s] Pulled back.', this.data.getName())
			this.events.fireVoidEventParm(Event.LimitEventsBOS, Math.abs(this.speed))
			this.fStrokeEventsArmed = false
		} else if (this.fStrokeEventsArmed && this.pos + dx < this.frameEnd + limit) {
			logger().info('[%s] Fired.', this.data.getName())
			this.events.fireVoidEventParm(Event.LimitEventsEOS, Math.abs(this.speed))
			this.fStrokeEventsArmed = false
		} else if (this.pos > this.frameEnd + hysteresis && this.pos < this.frameStart - hysteresis) {
			this.fStrokeEventsArmed = true
		}
		this.setObjects(this.pos)
	}

	public updateVelocities(): void {
		const pos = (this.pos - this.frameEnd) / this.frameLen
		const mech = 0
		const dMech = this.mech0 - mech
		const autoPlunger = this.data.autoPlunger
		const ReleaseThreshold = 0.2

		if (this.fireTimer > 0) {
			this.speed = this.fireSpeed
			--this.fireTimer
		} else if (this.autoFireTimer > 0) {
			if (--this.autoFireTimer === 0) {
				this.tableApi.fireKeyEvent(Event.GameEventsKeyUp, this.player.getKey(AssignKey.PlungerKey))
			}
		} else if (autoPlunger && dMech > ReleaseThreshold) {
			this.tableApi.fireKeyEvent(Event.GameEventsKeyDown, this.player.getKey(AssignKey.PlungerKey))
			this.autoFireTimer = 101
		} else if (this.pullForce !== 0) {
			this.speed += this.pullForce / this.mass
			if (this.pos >= this.frameStart) this.speed = 0
		} else if (dMech > ReleaseThreshold) {
			let apex = this.mech0
			if (this.mech1 > apex) {
				apex = this.mech1
				if (this.mech2 > apex) apex = this.mech2
			}
			this.fire(apex)
		} else {
			this.updateSyncVelocity(pos, mech, autoPlunger)
		}

		this.reverseImpulse = 0
		if (mech !== this.mech0) {
			this.mech2 = this.mech1
			this.mech1 = this.mech0
			this.mech0 = mech
		}
	}

	private updateSyncVelocity(pos: number, mech: number, autoPlunger: boolean): void {
		const target = autoPlunger ? this.restPos : mech
		const error = target - pos
		const plungerFriction = 0.95
		const normalize = this.tableApi.PlungerNormalize / 13 / 100
		const dt = 0.1
		this.speed *= plungerFriction
		this.speed += ((error * this.frameLen * this.data.mechStrength) / this.mass) * normalize * dt
		this.speed += this.reverseImpulse
	}

	public pullBack(speed: number): void {
		this.speed = 0
		this.pullForce = speed
	}

	public fire(startPos = 0): void {
		if (!startPos) startPos = (this.pos - this.frameEnd) / (this.frameStart - this.frameEnd)
		this.pullForce = 0
		if (startPos < this.restPos) startPos = this.restPos
		this.pos = this.frameEnd + startPos * this.frameLen

		const dx = startPos - this.restPos
		const normalize = this.tableApi.PlungerNormalize / 13 / 100
		this.fireSpeed = ((-this.data.speedFire * dx * this.frameLen) / this.mass) * normalize

		const maxPull = 0.5
		const bounceDist = dx < maxPull ? dx / maxPull : 1
		this.fireBounce = -bounceDist * this.restPos
		this.fireTimer = 200
	}

	private setObjects(len: number): void {
		this.lineSegBase.setSeg(this.x, this.y, this.x2, this.y)
		this.jointBase[0].set(this.x, this.y)
		this.jointBase[1].set(this.x2, this.y)
		this.lineSegSide[0].setSeg(this.x + 0.0001, len, this.x, this.y)
		this.lineSegSide[1].setSeg(this.x2, this.y, this.x2 + 0.0001, len)
		this.lineSegEnd.setSeg(this.x2, len, this.x, len)
		this.jointEnd[0].set(this.x, len)
		this.jointEnd[1].set(this.x2, len)
	}

	public getFrame(): number {
		const f = Math.floor(((this.pos - this.frameStart) / (this.frameEnd - this.frameStart)) * (this.cFrames - 1) + 0.5)
		return f < 0 ? 0 : f >= this.cFrames ? this.cFrames - 1 : f
	}
}
