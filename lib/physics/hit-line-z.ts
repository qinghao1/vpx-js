// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { solveQuadraticEq } from '../util/functions.js'
import { Vertex2D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { C_CONTACTVEL, PHYS_TOUCH } from './constants.js'
import { HitObject } from './hit-object.js'

/** Vertical line (Z) hit shape.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.cpp */
export class HitLineZ extends HitObject {
	constructor(
		protected xy: Vertex2D,
		zlow?: number,
		zhigh?: number,
	) {
		super()
		if (zlow !== undefined) this.hitBBox.zlow = zlow
		if (zhigh !== undefined) this.hitBBox.zhigh = zhigh
	}

	public set(x: number, y: number): this {
		this.xy.x = x
		this.xy.y = y
		return this
	}

	public calcHitBBox(): void {
		this.hitBBox.left = this.hitBBox.right = this.xy.x
		this.hitBBox.top = this.hitBBox.bottom = this.xy.y
	}

	public hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		if (!this.isEnabled) return -1
		const bp = Vertex2D.claim(ball.state.pos.x, ball.state.pos.y)
		const dist = bp.clone(true).sub(this.xy)
		const dv = Vertex2D.claim(ball.hit.vel.x, ball.hit.vel.y)
		Vertex2D.release(bp)
		const bcddsq = dist.lengthSq()
		const bcdd = Math.sqrt(bcddsq)
		if (bcdd <= 1e-6) {
			Vertex2D.release(dv, dist)
			return -1
		}
		const b = dist.dot(dv)
		const bnv = b / bcdd
		Vertex2D.release(dist)
		if (bnv > C_CONTACTVEL) {
			Vertex2D.release(dv)
			return -1
		}
		const bnd = bcdd - ball.data.radius
		const a = dv.lengthSq()
		Vertex2D.release(dv)
		let hitTime = 0
		let isContact = false
		if (bnd < PHYS_TOUCH) {
			if (Math.abs(bnv) <= C_CONTACTVEL) {
				isContact = true
				hitTime = 0
			} else hitTime = -bnd / bnv
		} else {
			if (a < 1e-8) return -1
			const sol = solveQuadraticEq(a, 2 * b, bcddsq - ball.data.radius * ball.data.radius)
			if (!sol) return -1
			hitTime = sol[0] * sol[1] < 0 ? Math.max(sol[0], sol[1]) : Math.min(sol[0], sol[1])
		}
		if (!isFinite(hitTime) || hitTime < 0 || hitTime > dTime) return -1
		const hitZ = ball.state.pos.z + hitTime * ball.hit.vel.z
		if (hitZ < this.hitBBox.zlow || hitZ > this.hitBBox.zhigh) return -1
		const hitX = ball.state.pos.x + hitTime * ball.hit.vel.x
		const hitY = ball.state.pos.y + hitTime * ball.hit.vel.y
		const norm = Vertex2D.claim(hitX - this.xy.x, hitY - this.xy.y).normalize()
		coll.hitNormal.set(norm.x, norm.y, 0)
		Vertex2D.release(norm)
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
