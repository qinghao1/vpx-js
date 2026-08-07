// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { degToRad } from '../../math/float.js'
import { Vertex2D } from '../../math/vertex2d.js'
import type { CollisionEvent } from '../../physics/collision-event.js'
import { CollisionType } from '../../physics/collision-type.js'
import { PHYS_SKIN } from '../../physics/constants.js'
import { HitObject } from '../../physics/hit-object.js'
import { LineSeg } from '../../physics/line-seg.js'
import type { Ball } from '../ball/ball.js'
import type { GateData } from './gate-data.js'
import { GateMover } from './gate-mover.js'
import type { GateState } from './gate-state.js'

/** Gate hit. */
export class GateHit extends HitObject {
	public readonly mover: GateMover
	public readonly lineSeg: LineSeg[] = []
	private readonly data: GateData

	public twoWay: boolean = false

	constructor(data: GateData, state: GateState, events: EventProxy, height: number) {
		super()
		this.data = data

		const halfLength = this.data.length * 0.5
		const radAngle = degToRad(this.data.rotation)
		const sn = Math.sin(radAngle)
		const cs = Math.cos(radAngle)

		const lineSeg0 = new LineSeg(
			new Vertex2D(
				this.data.center.x - cs * (halfLength + PHYS_SKIN),
				this.data.center.y - sn * (halfLength + PHYS_SKIN),
			),
			new Vertex2D(
				this.data.center.x + cs * (halfLength + PHYS_SKIN),
				this.data.center.y + sn * (halfLength + PHYS_SKIN),
			),
			height,
			height + 2.0 * PHYS_SKIN,
			CollisionType.Gate,
		)
		const lineSeg1 = new LineSeg(
			new Vertex2D(lineSeg0.v2.x, lineSeg0.v2.y),
			new Vertex2D(lineSeg0.v1.x, lineSeg0.v1.y),
			height,
			height + 2.0 * PHYS_SKIN,
			CollisionType.Gate,
		)
		this.lineSeg.push(lineSeg0)
		this.lineSeg.push(lineSeg1)

		this.mover = new GateMover(this.data, state, events)
		this.twoWay = false
	}

	public getMoverObject(): GateMover {
		return this.mover
	}

	public calcHitBBox(): void {
		// Bounding rect for both lines will be the same
		this.lineSeg[0].calcHitBBox()
		this.hitBBox = this.lineSeg[0].hitBBox
	}

	public hitTest(ball: Ball, dTime: number, coll: CollisionEvent, physics: PlayerPhysics): number {
		if (!this.isEnabled) {
			return -1.0
		}

		for (let i = 0; i < 2; ++i) {
			const hitTime = this.lineSeg[i].hitTestBasic(ball, dTime, coll, false, true, false) // any face, lateral, non-rigid
			if (hitTime >= 0) {
				// signal the Collide() function that the hit is on the front or back side
				coll.hitFlag = !!i
				return hitTime
			}
		}
		return -1.0
	}

	public collide(coll: CollisionEvent, physics: PlayerPhysics): void {
		const ball = coll.ball
		const hitNormal = coll.hitNormal

		const dot = hitNormal.dot(coll.ball.hit.vel)
		const h = this.data.height * 0.5

		// linear speed = ball speed
		// angular speed = linear/radius (height of hit)
		let speed = Math.abs(dot)
		// h is the height of the gate axis.
		if (Math.abs(h) > 1.0) {
			// avoid divide by zero
			speed /= h
		}

		this.mover.angleSpeed = speed
		if (!coll.hitFlag && !this.twoWay) {
			this.mover.angleSpeed *= 1.0 / 8.0 // Give a little bounce-back.
			return // hit from back doesn't count if not two-way
		}

		// We encoded which side of the spinner the ball hit
		if (coll.hitFlag && this.twoWay) {
			this.mover.angleSpeed = -this.mover.angleSpeed
		}

		this.fireHitEvent(ball)
	}
}
