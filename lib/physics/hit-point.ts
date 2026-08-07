// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { FRect3D } from '../util/frect3d.js'
import { solveQuadraticEq } from '../util/functions.js'
import { Vertex3D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { C_CONTACTVEL, PHYS_TOUCH } from './constants.js'
import { HitObject } from './hit-object.js'

/** Point hit shape.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.cpp */
export class HitPoint extends HitObject {
	constructor(private readonly p: Vertex3D) {
		super()
	}

	public calcHitBBox(): void {
		this.hitBBox = new FRect3D(this.p.x, this.p.x, this.p.y, this.p.y, this.p.z, this.p.z)
	}

	public hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		if (!this.isEnabled) return -1
		const dist = ball.state.pos.clone(true).sub(this.p)
		const bcddsq = dist.lengthSq()
		const bcdd = Math.sqrt(bcddsq)
		if (bcdd <= 1e-6) {
			Vertex3D.release(dist)
			return -1
		}
		const b = dist.dot(ball.hit.vel)
		const bnv = b / bcdd
		Vertex3D.release(dist)
		if (bnv > C_CONTACTVEL) return -1
		const bnd = bcdd - ball.data.radius
		const a = ball.hit.vel.lengthSq()
		let hitTime = 0
		let isContact = false
		if (bnd < PHYS_TOUCH) {
			if (Math.abs(bnv) <= C_CONTACTVEL) {
				isContact = true
				hitTime = 0
			} else hitTime = Math.max(0, -bnd / bnv)
		} else {
			if (a < 1e-8) return -1
			const sol = solveQuadraticEq(a, 2 * b, bcddsq - ball.data.radius * ball.data.radius)
			if (!sol) return -1
			hitTime = sol[0] * sol[1] < 0 ? Math.max(sol[0], sol[1]) : Math.min(sol[0], sol[1])
		}
		if (!isFinite(hitTime) || hitTime < 0 || hitTime > dTime) return -1
		const hitVel = ball.hit.vel.clone(true).multiplyScalar(hitTime)
		const hitNormal = ball.state.pos.clone(true).add(hitVel).sub(this.p).normalize()
		coll.hitNormal.set(hitNormal)
		Vertex3D.release(hitVel, hitNormal)
		coll.isContact = isContact
		if (isContact) coll.hitOrgNormalVelocity = bnv
		coll.hitDistance = bnd
		return hitTime
	}

	public collide(coll: CollisionEvent): void {
		const dot = coll.hitNormal.dot(coll.ball.hit.vel)
		coll.ball.hit.collide3DWall(coll.hitNormal, this.elasticity, this.elasticityFalloff, this.friction, this.scatter)
		if (dot <= -this.threshold) this.fireHitEvent(coll.ball)
	}
}
