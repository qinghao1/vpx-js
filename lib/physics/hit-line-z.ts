// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Vertex2D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { C_CONTACTVEL, PHYS_TOUCH } from './constants.js'
import { HitKind, HitObject } from './hit-object.js'

/** Vertical line (Z) hit shape.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.cpp */
export class HitLineZ extends HitObject {
	public override hitKind: HitKind = HitKind.LineZ
	constructor(
		public xy: Vertex2D,
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

	public override calcHitBBox(): void {
		this.hitBBox.left = this.hitBBox.right = this.xy.x
		this.hitBBox.top = this.hitBBox.bottom = this.xy.y
	}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		if (!this.isEnabled) return -1
		const lx = this.xy.x,
			ly = this.xy.y
		const bx = ball.state.pos.x,
			by = ball.state.pos.y,
			bz = ball.state.pos.z
		const vx = ball.hit.vel.x,
			vy = ball.hit.vel.y,
			vz = ball.hit.vel.z
		const dx = bx - lx,
			dy = by - ly
		const bcddsq = dx * dx + dy * dy,
			bcdd = Math.sqrt(bcddsq)
		if (bcdd <= 1e-6) return -1
		const b = dx * vx + dy * vy,
			bnv = b / bcdd
		if (bnv > C_CONTACTVEL) return -1
		const bnd = bcdd - ball.data.radius
		const a = vx * vx + vy * vy
		let hitTime = 0,
			isContact = false
		if (bnd < PHYS_TOUCH) {
			if (Math.abs(bnv) <= C_CONTACTVEL) isContact = true
			else hitTime = -bnd / bnv
		} else {
			if (a < 1e-8) return -1
			const discr = 4 * b * b - 4 * a * (bcddsq - ball.data.radius * ball.data.radius)
			if (discr < 0) return -1
			const s = Math.sqrt(discr)
			const inv = -0.5 / a
			const t1 = (2 * b + s) * inv
			const t2 = (2 * b - s) * inv
			hitTime = t1 * t2 < 0 ? Math.max(t1, t2) : Math.min(t1, t2)
		}
		if (!Number.isFinite(hitTime) || hitTime < 0 || hitTime > dTime) return -1
		const hitZ = bz + vz * hitTime
		if (hitZ < this.hitBBox.zlow || hitZ > this.hitBBox.zhigh) return -1
		const hx = bx + vx * hitTime,
			hy = by + vy * hitTime
		const nx = hx - lx,
			ny = hy - ly,
			len = Math.sqrt(nx * nx + ny * ny) || 1
		coll.hitNormal.x = nx / len
		coll.hitNormal.y = ny / len
		coll.hitNormal.z = 0
		coll.isContact = isContact
		if (isContact) coll.hitOrgNormalVelocity = bnv
		coll.hitDistance = bnd
		return hitTime
	}

	public override collide(coll: CollisionEvent): void {
		const dot = coll.hitNormal.dot(coll.ball.hit.vel)
		coll.ball.hit.collide3DWall(
			coll.hitNormal,
			this.elasticity,
			this.elasticityFalloff,
			this.friction,
			this.scatter,
		)
		if (dot <= -this.threshold) this.fireHitEvent(coll.ball)
	}
}
