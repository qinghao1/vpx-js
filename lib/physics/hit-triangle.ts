// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import { Vertex3D } from '../math/vertex3d.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { C_CONTACTVEL, C_LOWNORMVEL, PHYS_TOUCH } from './constants.js'
import { HitObject } from './hit-object.js'

/** Triangular hit face.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.cpp */
export class HitTriangle extends HitObject {
	public readonly rgv: Vertex3D[]
	public readonly normal: Vertex3D

	constructor(rgv: Vertex3D[]) {
		super()
		this.rgv = rgv
		const e0 = this.rgv[2].clone(true).sub(this.rgv[0])
		const e1 = this.rgv[1].clone(true).sub(this.rgv[0])
		this.normal = Vertex3D.crossProduct(e0, e1)
		this.normal.normalizeSafe()
		Vertex3D.release(e0, e1)
		this.elasticity = 0.3
		this.setFriction(0.3)
		this.scatter = 0
	}

	public calcHitBBox(): void {
		const b = this.hitBBox
		b.left = Math.min(this.rgv[0].x, this.rgv[1].x, this.rgv[2].x)
		b.right = Math.max(this.rgv[0].x, this.rgv[1].x, this.rgv[2].x)
		b.top = Math.min(this.rgv[0].y, this.rgv[1].y, this.rgv[2].y)
		b.bottom = Math.max(this.rgv[0].y, this.rgv[1].y, this.rgv[2].y)
		b.zlow = Math.min(this.rgv[0].z, this.rgv[1].z, this.rgv[2].z)
		b.zhigh = Math.max(this.rgv[0].z, this.rgv[1].z, this.rgv[2].z)
	}

	public hitTest(ball: Ball, dTime: number, coll: CollisionEvent, physics: PlayerPhysics): number {
		if (!this.isEnabled) return -1
		const bnv = this.normal.dot(ball.hit.vel)
		if (bnv > C_CONTACTVEL) return -1
		const normRadius = this.normal.clone(true).multiplyScalar(ball.data.radius)
		const hitPos = ball.state.pos.clone(true).sub(normRadius)
		const hpSub = hitPos.clone(true).sub(this.rgv[0])
		const bnd = this.normal.dot(hpSub)
		Vertex3D.release(normRadius, hpSub)
		if (bnd < -ball.data.radius) {
			Vertex3D.release(hitPos)
			return -1
		}
		let isContact = false
		let hitTime: number
		if (bnd <= PHYS_TOUCH) {
			if (Math.abs(bnv) <= C_CONTACTVEL) {
				hitTime = 0
				isContact = true
			} else if (bnd <= 0) hitTime = 0
			else hitTime = bnd / -bnv
		} else if (Math.abs(bnv) > C_LOWNORMVEL) hitTime = bnd / -bnv
		else {
			Vertex3D.release(hitPos)
			return -1
		}
		if (!isFinite(hitTime) || hitTime < 0 || hitTime > dTime) {
			Vertex3D.release(hitPos)
			return -1
		}
		const adv = ball.hit.vel.clone(true).multiplyScalar(hitTime)
		hitPos.add(adv)
		Vertex3D.release(adv)
		const v0 = this.rgv[2].clone(true).sub(this.rgv[0])
		const v1 = this.rgv[1].clone(true).sub(this.rgv[0])
		const v2 = hitPos.clone(true).sub(this.rgv[0])
		const dot00 = v0.dot(v0)
		const dot01 = v0.dot(v1)
		const dot02 = v0.dot(v2)
		const dot11 = v1.dot(v1)
		const dot12 = v1.dot(v2)
		Vertex3D.release(v0, v1, v2)
		const invDenom = 1 / (dot00 * dot11 - dot01 * dot01)
		const u = (dot11 * dot02 - dot01 * dot12) * invDenom
		const v = (dot00 * dot12 - dot01 * dot02) * invDenom
		const inside = u >= 0 && v >= 0 && u + v <= 1
		Vertex3D.release(hitPos)
		if (!inside) return -1
		coll.hitNormal.set(this.normal)
		coll.hitDistance = bnd
		if (isContact) {
			coll.isContact = true
			coll.hitOrgNormalVelocity = bnv
		}
		return hitTime
	}

	public collide(coll: CollisionEvent, physics: PlayerPhysics): void {
		const ball = coll.ball
		const dot = -coll.hitNormal.dot(ball.hit.vel)
		ball.hit.collide3DWall(this.normal, this.elasticity, this.elasticityFalloff, this.friction, this.scatter)
		if (this.obj && this.fe && dot >= this.threshold && this.obj.onCollision) this.obj.onCollision(this, ball, dot)
	}

	public isDegenerate(): boolean {
		return this.normal.isZero()
	}
}
