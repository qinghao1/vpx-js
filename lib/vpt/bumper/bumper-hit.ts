// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import type { CollisionEvent } from '../../physics/collision-event.js'
import { HitCircle } from '../../physics/hit-circle.js'
import type { BumperAnimation } from './bumper-animation.js'
import type { BumperData } from './bumper-data.js'
import type { BumperState } from './bumper-state.js'

export class BumperHit extends HitCircle {
	private readonly data: BumperData
	private readonly state: BumperState
	private readonly animation: BumperAnimation
	private readonly events: EventProxy

	constructor(data: BumperData, state: BumperState, animation: BumperAnimation, events: EventProxy, height: number) {
		super(data.center, data.radius, height, height + data.heightScale)
		this.data = data
		this.state = state
		this.animation = animation

		this.events = events
		this.isEnabled = this.data.isCollidable
		this.scatter = this.data.scatter!
	}

	public collide(coll: CollisionEvent, physics: PlayerPhysics): void {
		if (!this.isEnabled) {
			return
		}

		// needs to be computed before Collide3DWall()
		const dot = coll.hitNormal.dot(coll.ball.hit.vel)

		// reflect ball from wall
		coll.ball.hit.collide3DWall(coll.hitNormal, this.elasticity, this.elasticityFalloff, this.friction, this.scatter)

		// if velocity greater than threshold level
		if (this.data.hitEvent && dot <= -this.data.threshold) {
			// add a chunk of velocity to drive ball away
			coll.ball.hit.vel.addAndRelease(coll.hitNormal.clone(true).multiplyScalar(this.data.force))

			this.animation.hitEvent = true
			this.animation.ballHitPosition.setAndRelease(coll.ball.state.pos.clone(true))
			this.events.fireGroupEvent(Event.HitEventsHit)
		}
	}
}
