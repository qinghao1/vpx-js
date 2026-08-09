// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import type { Vertex2D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { CollisionType } from './collision-type.js'
import { C_CONTACTVEL, C_LOWNORMVEL, PHYS_TOUCH } from './constants.js'
import { HitKind, HitObject } from './hit-object.js'

/** Vertical cylinder hit shape.
 * @see https://github.com/vpinball/vpinball/blob/master/hitcircle.cpp */
export class HitCircle extends HitObject {
	public override hitKind = HitKind.Circle
	constructor(
		public center: Vertex2D,
		public readonly radius: number,
		zLow: number,
		zHigh: number,
	) {
		super()
		this.hitBBox.zlow = zLow
		this.hitBBox.zhigh = zHigh
	}

	public override collide(coll: CollisionEvent, _physics?: PlayerPhysics): void {
		coll.ball.hit.collide3DWall(
			coll.hitNormal,
			this.elasticity,
			this.elasticityFalloff,
			this.friction,
			this.scatter,
		)
	}

	public override calcHitBBox(): void {
		this.hitBBox.left = this.center.x - this.radius
		this.hitBBox.right = this.center.x + this.radius
		this.hitBBox.top = this.center.y - this.radius
		this.hitBBox.bottom = this.center.y + this.radius
	}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		return this.hitTestBasicRadius(ball, dTime, coll, true, true, true)
	}

	protected hitTestBasicRadius(
		ball: Ball,
		dTime: number,
		coll: CollisionEvent,
		direction: boolean,
		lateral: boolean,
		rigid: boolean,
	): number {
		if (!this.isEnabled || ball.state.isFrozen) return -1
		const cx = this.center.x, cy = this.center.y
		const bx = ball.state.pos.x, by = ball.state.pos.y, bz = ball.state.pos.z
		const vx = ball.hit.vel.x, vy = ball.hit.vel.y, vz = ball.hit.vel.z
		const br = ball.data.radius
		const capsule3D = !lateral && bz > this.hitBBox.zhigh
		const isKicker = this.objType === CollisionType.Kicker
		const isKickerOrTrigger = this.objType === CollisionType.Trigger || isKicker
		let dz = 0, dvz = vz, targetR: number
		if (capsule3D) {
			targetR = this.radius * (13 / 5)
			dz = bz - (this.hitBBox.zhigh - this.radius * (12 / 5))
		} else {
			targetR = lateral ? this.radius + br : this.radius
			dvz = 0
		}
		const dx = bx - cx, dy = by - cy
		const bcddsq = capsule3D ? dx * dx + dy * dy + dz * dz : dx * dx + dy * dy
		const bcdd = Math.sqrt(bcddsq)
		if (bcdd <= 1e-6) return -1
		const b = capsule3D ? dx * vx + dy * vy + dz * dvz : dx * vx + dy * vy
		const bnv = b / bcdd
		if (direction && bnv > C_LOWNORMVEL) return -1
		const bnd = bcdd - targetR
		const a = capsule3D ? vx * vx + vy * vy + dvz * dvz : vx * vx + vy * vy
		let hitTime = 0, isUnhit = false, isContact = false
		if (isKicker && bnd <= 0 && bnd >= -this.radius && a < C_CONTACTVEL * C_CONTACTVEL && ball.hit.isRealBall()) {
			if (ball.hit.vpVolObjs.includes(this.obj!)) ball.hit.vpVolObjs.splice(ball.hit.vpVolObjs.indexOf(this.obj!), 1)
		}
		if (rigid && bnd < PHYS_TOUCH) {
			if (bnd < -br) return -1
			if (Math.abs(bnv) <= C_CONTACTVEL) isContact = true
			else hitTime = Math.max(0, -bnd / bnv)
		} else if (isKickerOrTrigger && ball.hit.isRealBall() && (bnd < 0) !== ball.hit.vpVolObjs.includes(this.obj!)) {
			if (Math.abs(bnd - this.radius) < 0.05) ball.hit.vpVolObjs.push(this.obj!)
			else isUnhit = bnd > 0
		} else {
			if ((!rigid && bnd * bnv > 0) || a < 1e-8) return -1
			const discr = 4 * b * b - 4 * a * (bcddsq - targetR * targetR)
			if (discr < 0) return -1
			const s = Math.sqrt(discr)
			const inv = -0.5 / a
			const t1 = (2 * b + s) * inv
			const t2 = (2 * b - s) * inv
			isUnhit = t1 * t2 < 0
			hitTime = isUnhit ? Math.max(t1, t2) : Math.min(t1, t2)
		}
		if (!Number.isFinite(hitTime) || hitTime < 0 || hitTime > dTime) return -1
		const hitZ = bz + vz * hitTime
		if (hitZ + br * 0.5 < this.hitBBox.zlow || (!capsule3D && hitZ - br * 0.5 > this.hitBBox.zhigh) || (capsule3D && hitZ < this.hitBBox.zhigh)) return -1
		const hx = bx + vx * hitTime, hy = by + vy * hitTime
		const sqr = (hx - cx) ** 2 + (hy - cy) ** 2
		coll.hitNormal.setZero()
		if (sqr > 1e-8) {
			const inv = 1 / Math.sqrt(sqr)
			coll.hitNormal.x = (hx - cx) * inv
			coll.hitNormal.y = (hy - cy) * inv
		} else {
			coll.hitNormal.x = 0
			coll.hitNormal.y = 1
			coll.hitNormal.z = 0
		}
		if (!rigid) coll.hitFlag = isUnhit
		coll.isContact = isContact
		if (isContact) coll.hitOrgNormalVelocity = bnv
		coll.hitDistance = bnd
		return hitTime
	}
}
