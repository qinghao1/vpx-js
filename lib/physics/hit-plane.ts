// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex3D } from '../math/vertex3d.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { C_CONTACTVEL, PHYS_TOUCH } from './constants.js'
import { HitObject } from './hit-object.js'

/** Infinite plane hit shape (playfield / glass). */
export class HitPlane extends HitObject {
	private readonly normal: Vertex3D
	private readonly d: number

	constructor(normal: Vertex3D, d: number) {
		super()
		this.normal = normal
		this.d = d
	}

	public calcHitBBox(): void {}

	public hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		if (!this.isEnabled) return -1
		const bnv = this.normal.dot(ball.hit.vel)
		if (bnv > C_CONTACTVEL) return -1

		const bnd = this.normal.dot(ball.state.pos) - ball.data.radius - this.d
		if (bnd < ball.data.radius * -2) return -1

		if (Math.abs(bnv) <= C_CONTACTVEL) {
			if (Math.abs(bnd) <= PHYS_TOUCH) {
				coll.isContact = true
				coll.hitNormal.set(this.normal)
				coll.hitOrgNormalVelocity = bnv
				coll.hitDistance = bnd
				return 0
			}
			return -1
		}

		let hitTime = bnd / -bnv
		if (hitTime < 0) hitTime = 0
		if (!isFinite(hitTime) || hitTime < 0 || hitTime > dTime) return -1

		coll.hitNormal.set(this.normal)
		coll.hitDistance = bnd
		return hitTime
	}

	public collide(coll: CollisionEvent): void {
		coll.ball.hit.collide3DWall(coll.hitNormal, this.elasticity, this.elasticityFalloff, this.friction, this.scatter)
		const bnd = this.normal.dot(coll.ball.state.pos) - coll.ball.data.radius - this.d
		if (bnd < 0) {
			const v = this.normal.clone(true).multiplyScalar(bnd)
			coll.ball.state.pos.add(v)
			Vertex3D.release(v)
		}
	}
}
