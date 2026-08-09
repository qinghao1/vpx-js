// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Matrix2D, Vertex2D, Vertex3D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { HitKind } from './hit-object.js'
import { HitLineZ } from './hit-line-z.js'

/** 3D cylinder hit shape.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.cpp */
export class HitLine3D extends HitLineZ {
	public override hitKind: HitKind = HitKind.Line3D
	public readonly matrix = new Matrix2D()
	public zLow!: number
	public zHigh!: number

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
		const pos = ball.state.pos, vel = ball.hit.vel;
		const ox = pos.x, oy = pos.y, oz = pos.z;
		const ovx = vel.x, ovy = vel.y, ovz = vel.z;
		pos.applyMatrix2D(this.matrix);
		vel.applyMatrix2D(this.matrix);
		const saveZlow = this.hitBBox.zlow, saveZhigh = this.hitBBox.zhigh;
		this.hitBBox.zlow = this.zLow; this.hitBBox.zhigh = this.zHigh;
		const hitTime = super.hitTest(ball, dTime, coll);
		pos.x = ox; pos.y = oy; pos.z = oz;
		vel.x = ovx; vel.y = ovy; vel.z = ovz;
		this.hitBBox.zlow = saveZlow; this.hitBBox.zhigh = saveZhigh;
		if (hitTime >= 0) {
			const e = (this.matrix as any).elements as number[];
			const nx = coll.hitNormal.x, ny = coll.hitNormal.y, nz = coll.hitNormal.z;
			coll.hitNormal.x = e[0]*nx + e[1]*ny + e[2]*nz;
			coll.hitNormal.y = e[3]*nx + e[4]*ny + e[5]*nz;
			coll.hitNormal.z = e[6]*nx + e[7]*ny + e[8]*nz;
		}
		return hitTime;
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
