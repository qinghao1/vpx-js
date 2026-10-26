// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../game/event.js'
import { Vertex2D, Vertex3D } from '../math/vector.js'
import type { Surface, SurfaceData } from '../vpt/surface/surface.js'
import type { CollisionEvent } from './collision-event.js'
import { LineSeg } from './line-seg.js'

export class LineSegSlingshot extends LineSeg {
	public force = 0
	public doHitEvent = false

	constructor(
		readonly _surface: Surface,
		private readonly surfaceData: SurfaceData,
		p1: Vertex2D,
		p2: Vertex2D,
		zLow: number,
		zHigh: number,
	) {
		super(p1, p2, zLow, zHigh)
	}

	public override collide(coll: CollisionEvent): void {
		const ball = coll.ball
		const n = coll.hitNormal
		const dot = n.dot(ball.hit.vel)

		if (!this.surfaceData.isDisabled && dot <= -this.surfaceData.slingshotThreshold) {
			const len = (this.v2.x - this.v1.x) * n.y - (this.v2.y - this.v1.y) * n.x
			const hp = Vertex2D.claim(
				ball.state.pos.x - n.x * ball.data.radius,
				ball.state.pos.y - n.y * ball.data.radius,
			)
			const btd = (hp.x - this.v1.x) * n.y - (hp.y - this.v1.y) * n.x
			Vertex2D.release(hp)
			const edge = Math.abs(len) > 1e-6 ? (btd + btd) / len - 1 : -1
			ball.hit.vel.addScaledVector(n, -0.5 * (1 - edge * edge) * this.force)
		}

		ball.hit.collide3DWall(n, this.elasticity, this.elasticityFalloff, this.friction, this.scatter)

		if (this.obj && this.fe && !this.surfaceData.isDisabled && dot <= -this.surfaceData.slingshotThreshold) {
			const posDiff = ball.hit.eventPos.clone(true).sub(ball.state.pos)
			const distSq = posDiff.lengthSq()
			Vertex3D.release(posDiff)
			ball.hit.eventPos.set(ball.state.pos)
			if (distSq > 0.25) {
				this.obj.fireGroupEvent(Event.SurfaceEventsSlingshot)
			}
		}
	}
}
