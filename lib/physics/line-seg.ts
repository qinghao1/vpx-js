// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex2D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { CollisionType } from './collision-type.js'
import { C_CONTACTVEL, C_LOWNORMVEL, C_TOL_ENDPNTS, C_TOL_RADIUS, PHYS_TOUCH } from './constants.js'
import { HitKind, HitObject } from './hit-object.js'

/** 2D line segment hit shape.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.cpp */
export class LineSeg extends HitObject {
	public override hitKind = HitKind.LineSeg
	public readonly v1: Vertex2D
	public readonly v2: Vertex2D
	public normal: Vertex2D = new Vertex2D()
	public length!: number

	constructor(p1: Vertex2D, p2: Vertex2D, zLow: number, zHigh: number, objType?: CollisionType) {
		super()
		this.v1 = p1
		this.v2 = p2
		this.hitBBox.zlow = zLow
		this.hitBBox.zhigh = zHigh
		this.calcNormal()
		this.calcHitBBox()
		if (objType) this.objType = objType
	}

	public setSeg(x1: number, y1: number, x2: number, y2: number): this {
		this.v1.x = x1
		this.v1.y = y1
		this.v2.x = x2
		this.v2.y = y2
		return this.calcNormal().calcHitBBox()
	}

	public override calcHitBBox(): this {
		this.hitBBox.left = Math.min(this.v1.x, this.v2.x)
		this.hitBBox.right = Math.max(this.v1.x, this.v2.x)
		this.hitBBox.top = Math.min(this.v1.y, this.v2.y)
		this.hitBBox.bottom = Math.max(this.v1.y, this.v2.y)
		return this
	}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		return this.hitTestBasic(ball, dTime, coll, true, true, true)
	}

	public hitTestBasic(
		ball: Ball,
		dTime: number,
		coll: CollisionEvent,
		direction: boolean,
		lateral: boolean,
		rigid: boolean,
	): number {
		if (!this.isEnabled || ball.state.isFrozen) return -1
		const bnv = ball.hit.vel.x * this.normal.x + ball.hit.vel.y * this.normal.y
		let isUnHit = bnv > C_LOWNORMVEL
		if (direction && bnv > C_LOWNORMVEL) return -1
		const rollingRadius = lateral ? ball.data.radius : C_TOL_RADIUS
		const bcpd = (ball.state.pos.x - this.v1.x) * this.normal.x + (ball.state.pos.y - this.v1.y) * this.normal.y
		let bnd = bcpd - rollingRadius
		if (this.objType === CollisionType.Spinner || this.objType === CollisionType.Gate) bnd = bcpd + rollingRadius
		const inside = bnd <= 0
		let hitTime: number | undefined
		if (rigid) {
			if (bnd < -ball.data.radius || (lateral && bcpd < 0)) return -1
			if (lateral && bnd <= PHYS_TOUCH) {
				if (inside || Math.abs(bnv) > C_CONTACTVEL || bnd <= -PHYS_TOUCH) hitTime = 0
				else hitTime = bnd * (1 / (2 * PHYS_TOUCH)) + 0.5
			} else if (Math.abs(bnv) > C_LOWNORMVEL) hitTime = bnd / -bnv
			else return -1
		} else {
			if (bnv * bnd >= 0) {
				const notInVol = ball.hit.vpVolObjs.indexOf(this.obj!) < 0
				if (
					this.objType !== CollisionType.Trigger ||
					!ball.hit.isRealBall() ||
					Math.abs(bnd) >= ball.data.radius * 0.5 ||
					inside !== notInVol
				)
					return -1
				hitTime = 0
				isUnHit = !inside
			} else hitTime = bnd / -bnv
		}
		if (!Number.isFinite(hitTime!) || hitTime! < 0 || hitTime! > dTime) return -1
		const btv = ball.hit.vel.x * this.normal.y - ball.hit.vel.y * this.normal.x
		const btd =
			(ball.state.pos.x - this.v1.x) * this.normal.y -
			(ball.state.pos.y - this.v1.y) * this.normal.x +
			btv * hitTime!
		if (btd < -C_TOL_ENDPNTS || btd > this.length + C_TOL_ENDPNTS) return -1
		if (!rigid) coll.hitFlag = isUnHit
		const hitZ = ball.state.pos.z + ball.hit.vel.z * hitTime!
		if (hitZ + ball.data.radius * 0.5 < this.hitBBox.zlow || hitZ - ball.data.radius * 0.5 > this.hitBBox.zhigh)
			return -1
		coll.hitNormal.set(this.normal.x, this.normal.y, 0)
		coll.hitDistance = bnd
		if (Math.abs(bnv) <= C_CONTACTVEL && Math.abs(bnd) <= PHYS_TOUCH) {
			coll.isContact = true
			coll.hitOrgNormalVelocity = bnv
		}
		return hitTime!
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

	private calcNormal(): this {
		const vT = Vertex2D.claim(this.v1.x - this.v2.x, this.v1.y - this.v2.y)
		this.length = vT.length()
		const inv = 1 / this.length
		this.normal.set(vT.y * inv, -vT.x * inv)
		Vertex2D.release(vT)
		return this
	}
}