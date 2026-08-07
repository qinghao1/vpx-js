// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../game/event.js'
import type { PlayerPhysics } from '../game/player-physics.js'
import { Vertex2D } from '../math/vertex2d.js'
import { Vertex3D } from '../math/vertex3d.js'
import type { Surface } from '../vpt/surface/surface.js'
import type { SurfaceData } from '../vpt/surface/surface-data.js'
import { SlingshotAnimObject } from './anim-slingshot.js'
import type { CollisionEvent } from './collision-event.js'
import { LineSeg } from './line-seg.js'

/** Slingshot line segment. */
export class LineSegSlingshot extends LineSeg {
	private readonly physics: PlayerPhysics
	private readonly surface: Surface
	private readonly surfaceData: SurfaceData
	private slingshotAnim = new SlingshotAnimObject()
	public force = 0
	private eventTimeReset = 0
	public doHitEvent = false

	constructor(
		surface: Surface,
		surfaceData: SurfaceData,
		p1: Vertex2D,
		p2: Vertex2D,
		zLow: number,
		zHigh: number,
		physics: PlayerPhysics,
	) {
		super(p1, p2, zLow, zHigh)
		this.surface = surface
		this.surfaceData = surfaceData
		this.physics = physics
	}

	public override collide(coll: CollisionEvent): void {
		const ball = coll.ball
		const n = coll.hitNormal
		const dot = n.dot(ball.hit.vel)

		if (!this.surfaceData.isDisabled && dot <= -this.surfaceData.slingshotThreshold) {
			const len = (this.v2.x - this.v1.x) * n.y - (this.v2.y - this.v1.y) * n.x
			const hp = Vertex2D.claim(ball.state.pos.x - n.x * ball.data.radius, ball.state.pos.y - n.y * ball.data.radius)
			const btd = (hp.x - this.v1.x) * n.y - (hp.y - this.v1.y) * n.x
			Vertex2D.release(hp)
			let force = Math.abs(len) > 1e-6 ? (btd + btd) / len - 1 : -1
			force = 0.5 * (1 - force * force) * this.force
			const f = n.clone(true).multiplyScalar(force)
			ball.hit.vel.sub(f)
			Vertex3D.release(f)
		}

		ball.hit.collide3DWall(n, this.elasticity, this.elasticityFalloff, this.friction, this.scatter)

		if (this.obj && this.fe && !this.surfaceData.isDisabled && this.threshold) {
			const posDiff = ball.hit.eventPos.clone(true).sub(ball.state.pos)
			const distSq = posDiff.lengthSq()
			Vertex3D.release(posDiff)
			ball.hit.eventPos.set(ball.state.pos)
			if (distSq > 0.25) {
				this.obj.fireGroupEvent(Event.SurfaceEventsSlingshot)
				this.slingshotAnim.timeReset = this.physics.timeMsec + 100
			}
		}
	}
}
