// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix2D, Vertex2D, Vertex3D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { HitLineZ } from './hit-line-z.js'

/** 3D cylinder hit shape.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.cpp */
export class HitLine3D extends HitLineZ {
	private readonly matrix = new Matrix2D()
	private zLow!: number
	private zHigh!: number

	constructor(v1: Vertex3D, v2: Vertex3D) {
		super(new Vertex2D())
		const vLine = v2.clone(true).sub(v1)
		vLine.normalize()
		const axis = Vertex3D.claim(vLine.y, -vLine.x, 0)
		const l = axis.lengthSq()
		if (l <= 1e-6) axis.set(1, 0, 0)
		else axis.divideScalar(Math.sqrt(l))
		const dot = vLine.z
		this.matrix.rotationAroundAxis(axis, -Math.sqrt(1 - dot * dot), dot)
		const t1 = v1.clone(true).applyMatrix2D(this.matrix)
		const t2 = v2.clone(true).applyMatrix2D(this.matrix)
		this.xy.set(t1.x, t1.y)
		this.zLow = Math.min(t1.z, t2.z)
		this.zHigh = Math.max(t1.z, t2.z)
		this.hitBBox.left = Math.min(v1.x, v2.x)
		this.hitBBox.right = Math.max(v1.x, v2.x)
		this.hitBBox.top = Math.min(v1.y, v2.y)
		this.hitBBox.bottom = Math.max(v1.y, v2.y)
		this.hitBBox.zlow = Math.min(v1.z, v2.z)
		this.hitBBox.zhigh = Math.max(v1.z, v2.z)
		Vertex3D.release(t1, t2, axis, vLine)
	}

	public override calcHitBBox(): void {}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		if (!this.isEnabled) return -1
		const oldPos = ball.state.pos.clone(true)
		const oldVel = ball.hit.vel.clone(true)
		ball.state.pos.applyMatrix2D(this.matrix)
		ball.hit.vel.applyMatrix2D(this.matrix)
		const oldZ = Vertex2D.claim(this.hitBBox.zlow, this.hitBBox.zhigh)
		this.hitBBox.zlow = this.zLow
		this.hitBBox.zhigh = this.zHigh
		const hitTime = super.hitTest(ball, dTime, coll)
		ball.state.pos.set(oldPos.x, oldPos.y, oldPos.z)
		ball.hit.vel.set(oldVel.x, oldVel.y, oldVel.z)
		this.hitBBox.zlow = oldZ.x
		this.hitBBox.zhigh = oldZ.y
		if (hitTime >= 0) coll.hitNormal.setAndRelease(this.matrix.multiplyVectorT(coll.hitNormal, true))
		Vertex2D.release(oldZ)
		Vertex3D.release(oldPos, oldVel)
		return hitTime
	}

	public override collide(coll: CollisionEvent): void {
		const dot = -coll.hitNormal.dot(coll.ball.hit.vel)
		coll.ball.hit.collide3DWall(
			coll.hitNormal,
			this.elasticity,
			this.elasticityFalloff,
			this.friction,
			this.scatter,
		)
		if (this.obj && this.fe && dot >= this.threshold && this.obj.onCollision)
			this.obj.onCollision(this, coll.ball, dot)
	}
}
