// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import type { CollisionEvent } from '../../physics/collision-event.js'
import { CollisionType } from '../../physics/collision-type.js'
import { STATICTIME } from '../../physics/constants.js'
import { LineSeg } from '../../physics/line-seg.js'
import type { Vertex2D } from '../../util/math.js'
import type { Ball } from '../ball/ball.js'
import type { TriggerAnimation } from './trigger-animation.js'
import type { TriggerData } from './trigger-data.js'

/** TriggerLineSeg. */
export class TriggerLineSeg extends LineSeg {
	private readonly data: TriggerData
	private readonly animation: TriggerAnimation

	constructor(
		p1: Vertex2D,
		p2: Vertex2D,
		zLow: number,
		zHigh: number,
		data: TriggerData,
		animation: TriggerAnimation,
	) {
		super(p1, p2, zLow, zHigh, undefined)
		this.data = data
		this.animation = animation
		this.objType = CollisionType.Trigger
	}

	public hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		if (!this.data.isEnabled) {
			return -1.0
		}

		// approach either face, not lateral-rolling point (assume center), not a rigid body contact
		return this.hitTestBasic(ball, dTime, coll, false, false, false)
	}

	public collide(coll: CollisionEvent): void {
		const ball = coll.ball

		if (this.objType !== CollisionType.Trigger || !ball.hit.isRealBall()) {
			return
		}

		const i = ball.hit.vpVolObjs.indexOf(this.obj!)

		// if -1 then not in objects volume set (i.e not already hit)
		if (coll.hitFlag !== i < 0) {
			// Hit == NotAlreadyHit
			ball.state.pos.addAndRelease(ball.hit.vel.clone(true).multiplyScalar(STATICTIME)) // move ball slightly forward

			if (i < 0) {
				ball.hit.vpVolObjs.push(this.obj!)
				this.animation.triggerAnimationHit()
				this.obj?.fireGroupEvent(Event.HitEventsHit)
			} else {
				ball.hit.vpVolObjs.splice(i, 1)
				this.animation.triggerAnimationUnhit()
				this.obj?.fireGroupEvent(Event.HitEventsUnhit)
			}
		}
	}
}
