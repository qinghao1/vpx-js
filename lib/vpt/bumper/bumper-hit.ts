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

/** Bumper hit shape. @see https://github.com/vpinball/vpinball/blob/master/bumper.cpp */
export class BumperHit extends HitCircle {
	constructor(
		private readonly data: BumperData,
		private readonly state: BumperState,
		private readonly animation: BumperAnimation,
		private readonly events: EventProxy,
		height: number,
	) {
		super(data.center, data.radius, height, height + data.heightScale)
		this.isEnabled = data.isCollidable
		this.scatter = data.scatter!
	}
	public override collide(coll: CollisionEvent, _physics: PlayerPhysics): void {
		if (!this.isEnabled) return
		const dot = coll.hitNormal.dot(coll.ball.hit.vel)
		coll.ball.hit.collide3DWall(
			coll.hitNormal,
			this.elasticity,
			this.elasticityFalloff,
			this.friction,
			this.scatter,
		)
		if (this.data.hitEvent && dot <= -this.data.threshold) {
			coll.ball.hit.vel.addAndRelease(coll.hitNormal.clone(true).multiplyScalar(this.data.force))
			this.animation.hitEvent = true
			this.animation.ballHitPosition.setAndRelease(coll.ball.state.pos.clone(true))
			this.events.fireGroupEvent(Event.HitEventsHit)
		}
	}
}
