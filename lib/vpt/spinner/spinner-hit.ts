// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'

import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import type { CollisionEvent } from '../../physics/collision-event.js'
import { CollisionType } from '../../physics/collision-type.js'
import { PHYS_SKIN } from '../../physics/constants.js'
import { HitObject } from '../../physics/hit-object.js'
import { LineSeg } from '../../physics/line-seg.js'
import { Vertex2D } from '../../util/vector.js'
import type { Ball } from '../ball/ball.js'
import type { SpinnerData } from './spinner-data.js'
import { SpinnerMover } from './spinner-mover.js'
import type { SpinnerState } from './spinner-state.js'

/** Spinner hit. */
export class SpinnerHit extends HitObject {
	private readonly data: SpinnerData
	private readonly state: SpinnerState
	private readonly mover: SpinnerMover
	private readonly lineSegs: LineSeg[] = []

	constructor(data: SpinnerData, state: SpinnerState, events: EventProxy, height: number) {
		super()

		this.data = data
		this.state = state
		const halfLength = data.length * 0.5

		const radAngle = MathUtils.degToRad(data.rotation)
		const sn = Math.sin(radAngle)
		const cs = Math.cos(radAngle)

		const v1 = new Vertex2D(
			data.center.x - cs * (halfLength + PHYS_SKIN), // through the edge of the
			data.center.y - sn * (halfLength + PHYS_SKIN), // spinner
		)
		const v2 = new Vertex2D(
			data.center.x + cs * (halfLength + PHYS_SKIN), // oversize by the ball radius
			data.center.y + sn * (halfLength + PHYS_SKIN), // this will prevent clipping
		)
		this.lineSegs.push(new LineSeg(v1, v2, height, height + 2.0 * PHYS_SKIN, CollisionType.Spinner))
		this.lineSegs.push(new LineSeg(v2.clone(), v1.clone(), height, height + 2.0 * PHYS_SKIN, CollisionType.Spinner))

		this.mover = new SpinnerMover(data, state, events)
		this.state.angle = MathUtils.clamp(0.0, this.mover.angleMin, this.mover.angleMax)
	}

	public getMoverObject(): SpinnerMover {
		return this.mover
	}

	public override calcHitBBox(): void {
		// Bounding rect for both lines will be the same
		this.lineSegs[0].calcHitBBox()
		this.hitBBox = this.lineSegs[0].hitBBox
	}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent, _physics: PlayerPhysics): number {
		if (!this.isEnabled) {
			return -1.0
		}
		for (let i = 0; i < 2; ++i) {
			const hitTime = this.lineSegs[i].hitTestBasic(ball, dTime, coll, false, true, false) // any face, lateral, non-rigid
			if (hitTime >= 0) {
				// signal the Collide() function that the hit is on the front or back side
				coll.hitFlag = !i
				return hitTime
			}
		}
		return -1.0
	}

	public override collide(coll: CollisionEvent, _physics: PlayerPhysics): void {
		const dot = coll.hitNormal.dot(coll.ball.hit.vel)
		if (dot < 0) {
			// hit from back doesn't count
			return
		}

		const h = this.data.height * 0.5

		// h is the height of the spinner axis;
		// Since the spinner has no mass in our equation, the spot
		// h -coll.m_radius will be moving a at linear rate of
		// 'speed'.  We can calculate the angular speed from that.

		this.mover.angleSpeed = Math.abs(dot) // use this until a better value comes along
		if (Math.abs(h) > 1.0) {
			// avoid divide by zero
			this.mover.angleSpeed /= h
		}
		this.mover.angleSpeed *= this.mover.damping

		// We encoded which side of the spinner the ball hit
		if (coll.hitFlag) {
			this.mover.angleSpeed = -this.mover.angleSpeed
		}
	}
}
