// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import type { CollisionEvent } from '../../physics/collision-event.js'
import { CollisionType } from '../../physics/collision-type.js'
import { STATICTIME } from '../../physics/constants.js'
import { HitCircle } from '../../physics/hit-circle.js'
import type { Ball } from '../ball/ball.js'
import type { Table } from '../table/table.js'
import type { TriggerAnimation } from './trigger-animation.js'
import type { TriggerData } from './trigger-data.js'

export class TriggerHitCircle extends HitCircle {
	private readonly animation: TriggerAnimation

	constructor(data: TriggerData, animation: TriggerAnimation, events: EventProxy, table: Table) {
		super(
			data.center,
			data.radius,
			table.getSurfaceHeight(data.szSurface, data.center.x, data.center.y),
			table.getSurfaceHeight(data.szSurface, data.center.x, data.center.y) + data.hitHeight,
		)
		this.animation = animation
		this.isEnabled = data.isEnabled
		this.objType = CollisionType.Trigger
		this.obj = events
	}

	public hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		// any face, not-lateral, non-rigid
		return super.hitTestBasicRadius(ball, dTime, coll, false, false, false)
	}

	public collide(coll: CollisionEvent, physics: PlayerPhysics): void {
		const ball = coll.ball

		if ((this.objType !== CollisionType.Trigger && this.objType !== CollisionType.Kicker) || !ball.hit.isRealBall()) {
			return
		}

		const i = ball.hit.vpVolObjs.indexOf(this.obj!) // if -1 then not in objects volume set (i.e not already hit)
		if (coll.hitFlag !== i < 0) {
			// Hit == NotAlreadyHit
			ball.state.pos.addAndRelease(ball.hit.vel.clone(true).multiplyScalar(STATICTIME)) // move ball slightly forward

			if (i < 0) {
				ball.hit.vpVolObjs.push(this.obj!)
				this.animation.triggerAnimationHit()
				this.obj!.fireGroupEvent(Event.HitEventsHit)
			} else {
				ball.hit.vpVolObjs.splice(i, 1)
				this.animation.triggerAnimationUnhit()
				this.obj!.fireGroupEvent(Event.HitEventsUnhit)
			}
		}
	}
}
