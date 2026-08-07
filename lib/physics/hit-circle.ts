// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import { solveQuadraticEq } from '../math/functions.js'
import type { Vertex2D } from '../math/vertex2d.js'
import { Vertex3D } from '../math/vertex3d.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { CollisionType } from './collision-type.js'
import { C_CONTACTVEL, C_LOWNORMVEL, PHYS_TOUCH } from './constants.js'
import { HitObject } from './hit-object.js'

/** Vertical cylinder hit shape.
 * @see https://github.com/vpinball/vpinball/blob/master/hitcircle.cpp */
export class HitCircle extends HitObject {
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

	public collide(coll: CollisionEvent, physics: PlayerPhysics): void {
		coll.ball.hit.collide3DWall(coll.hitNormal, this.elasticity, this.elasticityFalloff, this.friction, this.scatter)
	}
	public calcHitBBox(): void {
		this.hitBBox.left = this.center.x - this.radius
		this.hitBBox.right = this.center.x + this.radius
		this.hitBBox.top = this.center.y - this.radius
		this.hitBBox.bottom = this.center.y + this.radius
	}
	public hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
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
		const c = Vertex3D.claim(this.center.x, this.center.y, 0)
		const dist = ball.state.pos.clone(true).sub(c),
			dv = ball.hit.vel.clone(true)
		const capsule3D = !lateral && ball.state.pos.z > this.hitBBox.zhigh
		const isKicker = this.objType === CollisionType.Kicker,
			isKickerOrTrigger = this.objType === CollisionType.Trigger || isKicker
		let targetR: number
		if (capsule3D) {
			targetR = this.radius * (13 / 5)
			c.z = this.hitBBox.zhigh - this.radius * (12 / 5)
			dist.z = ball.state.pos.z - c.z
		} else {
			targetR = lateral ? this.radius + ball.data.radius : this.radius
			dist.z = 0
			dv.z = 0
		}
		const bcddsq = dist.lengthSq(),
			bcdd = Math.sqrt(bcddsq)
		if (bcdd <= 1e-6) {
			Vertex3D.release(dist, dv, c)
			return -1
		}
		const b = dist.dot(dv),
			bnv = b / bcdd
		Vertex3D.release(dist)
		if (direction && bnv > C_LOWNORMVEL) {
			Vertex3D.release(dv, c)
			return -1
		}
		const bnd = bcdd - targetR,
			a = dv.lengthSq()
		Vertex3D.release(dv)
		let hitTime = 0,
			isUnhit = false,
			isContact = false
		if (isKicker && bnd <= 0 && bnd >= -this.radius && a < C_CONTACTVEL * C_CONTACTVEL && ball.hit.isRealBall()) {
			if (ball.hit.vpVolObjs.includes(this.obj!)) ball.hit.vpVolObjs.splice(ball.hit.vpVolObjs.indexOf(this.obj!), 1)
		}
		if (rigid && bnd < PHYS_TOUCH) {
			if (bnd < -ball.data.radius) {
				Vertex3D.release(c)
				return -1
			}
			if (Math.abs(bnv) <= C_CONTACTVEL) isContact = true
			else hitTime = Math.max(0, -bnd / bnv)
		} else if (isKickerOrTrigger && ball.hit.isRealBall() && bnd < 0 !== ball.hit.vpVolObjs.includes(this.obj!)) {
			if (Math.abs(bnd - this.radius) < 0.05) ball.hit.vpVolObjs.push(this.obj!)
			else isUnhit = bnd > 0
		} else {
			if ((!rigid && bnd * bnv > 0) || a < 1e-8) {
				Vertex3D.release(c)
				return -1
			}
			const sol = solveQuadraticEq(a, 2 * b, bcddsq - targetR * targetR)
			if (!sol) {
				Vertex3D.release(c)
				return -1
			}
			const [t1, t2] = sol
			isUnhit = t1 * t2 < 0
			hitTime = isUnhit ? Math.max(t1, t2) : Math.min(t1, t2)
		}
		if (!isFinite(hitTime) || hitTime < 0 || hitTime > dTime) {
			Vertex3D.release(c)
			return -1
		}
		const hitZ = ball.state.pos.z + ball.hit.vel.z * hitTime
		if (
			hitZ + ball.data.radius * 0.5 < this.hitBBox.zlow ||
			(!capsule3D && hitZ - ball.data.radius * 0.5 > this.hitBBox.zhigh) ||
			(capsule3D && hitZ < this.hitBBox.zhigh)
		) {
			Vertex3D.release(c)
			return -1
		}
		const hx = ball.state.pos.x + ball.hit.vel.x * hitTime,
			hy = ball.state.pos.y + ball.hit.vel.y * hitTime,
			sqr = (hx - c.x) ** 2 + (hy - c.y) ** 2
		coll.hitNormal.setZero()
		if (sqr > 1e-8) {
			const inv = 1 / Math.sqrt(sqr)
			coll.hitNormal.x = (hx - c.x) * inv
			coll.hitNormal.y = (hy - c.y) * inv
		} else {
			coll.hitNormal.x = 0
			coll.hitNormal.y = 1
			coll.hitNormal.z = 0
		}
		Vertex3D.release(c)
		if (!rigid) coll.hitFlag = isUnhit
		coll.isContact = isContact
		if (isContact) coll.hitOrgNormalVelocity = bnv
		coll.hitDistance = bnd
		return hitTime
	}
}
