// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import { Vertex3D } from '../math/vertex3d.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { C_CONTACTVEL, C_LOWNORMVEL, PHYS_TOUCH } from './constants.js'
import { HitObject } from './hit-object.js'

/** Triangular hit shape. */
export class HitTriangle extends HitObject {
	public readonly rgv: Vertex3D[]
	public readonly normal: Vertex3D

	constructor(rgv: Vertex3D[]) {
		super()
		this.rgv = rgv
		/* NB: due to the swapping of the order of e0 and e1,
		 * the vertices must be passed in counterclockwise order
		 * (but rendering uses clockwise order!)
		 */
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
		this.hitBBox.left = Math.min(this.rgv[0].x, Math.min(this.rgv[1].x, this.rgv[2].x))
		this.hitBBox.right = Math.max(this.rgv[0].x, Math.max(this.rgv[1].x, this.rgv[2].x))
		this.hitBBox.top = Math.min(this.rgv[0].y, Math.min(this.rgv[1].y, this.rgv[2].y))
		this.hitBBox.bottom = Math.max(this.rgv[0].y, Math.max(this.rgv[1].y, this.rgv[2].y))
		this.hitBBox.zlow = Math.min(this.rgv[0].z, Math.min(this.rgv[1].z, this.rgv[2].z))
		this.hitBBox.zhigh = Math.max(this.rgv[0].z, Math.max(this.rgv[1].z, this.rgv[2].z))
	}

	public hitTest(ball: Ball, dTime: number, coll: CollisionEvent, physics: PlayerPhysics): number {
		if (!this.isEnabled) {
			return -1.0
		}

		const bnv = this.normal.dot(ball.hit.vel) // speed in Normal-vector direction
		if (bnv > C_CONTACTVEL) {
			// return if clearly ball is receding from object
			return -1.0
		}

		// Point on the ball that will hit the polygon, if it hits at all
		const normRadius = this.normal.clone(true).multiplyScalar(ball.data.radius)
		const hitPos = ball.state.pos.clone(true).sub(normRadius) // nearest point on ball ... projected radius along norm
		const hpSubRgv0 = hitPos.clone(true).sub(this.rgv[0])
		const bnd = this.normal.dot(hpSubRgv0) // distance from plane to ball
		Vertex3D.release(normRadius, hpSubRgv0)

		if (bnd < -ball.data.radius) {
			// (ball normal distance) excessive penetration of object skin ... no collision HACK
			Vertex3D.release(hitPos)
			return -1.0
		}

		let isContact = false
		let hitTime: number

		if (bnd <= PHYS_TOUCH) {
			if (Math.abs(bnv) <= C_CONTACTVEL) {
				hitTime = 0
				isContact = true
			} else if (bnd <= 0) {
				hitTime = 0 // zero time for rigid fast bodies
			} else {
				hitTime = bnd / -bnv
			}
		} else if (Math.abs(bnv) > C_LOWNORMVEL) {
			// not velocity low?
			hitTime = bnd / -bnv // rate ok for safe divide
		} else {
			Vertex3D.release(hitPos)
			return -1.0 // wait for touching
		}

		if (!isFinite(hitTime) || hitTime < 0 || hitTime > dTime) {
			Vertex3D.release(hitPos)
			return -1.0 // time is outside this frame ... no collision
		}

		// advance hit point to contact
		const adv = ball.hit.vel.clone(true).multiplyScalar(hitTime)
		hitPos.add(adv)
		Vertex3D.release(adv)

		// Check if hitPos is within the triangle
		// 1. Compute vectors
		const v0 = this.rgv[2].clone(true).sub(this.rgv[0])
		const v1 = this.rgv[1].clone(true).sub(this.rgv[0])
		const v2 = hitPos.clone(true).sub(this.rgv[0])

		// 2. Compute dot products
		const dot00 = v0.dot(v0)
		const dot01 = v0.dot(v1)
		const dot02 = v0.dot(v2)
		const dot11 = v1.dot(v1)
		const dot12 = v1.dot(v2)

		Vertex3D.release(v0, v1, v2)

		// 3. Compute barycentric coordinates
		const invDenom = 1.0 / (dot00 * dot11 - dot01 * dot01)
		const u = (dot11 * dot02 - dot01 * dot12) * invDenom
		const v = (dot00 * dot12 - dot01 * dot02) * invDenom

		// 4. Check if point is in triangle
		const pointInTriangle = u >= 0 && v >= 0 && u + v <= 1

		Vertex3D.release(hitPos)
		if (pointInTriangle) {
			coll.hitNormal.set(this.normal)
			coll.hitDistance = bnd // 3dhit actual contact distance ...
			//coll.m_hitRigid = true;                      // collision type

			if (isContact) {
				coll.isContact = true
				coll.hitOrgNormalVelocity = bnv
			}
			return hitTime
		} else {
			return -1.0
		}
	}

	public collide(coll: CollisionEvent, physics: PlayerPhysics): void {
		const ball = coll.ball
		const hitNormal = coll.hitNormal
		const dot = -hitNormal.dot(ball.hit.vel)

		ball.hit.collide3DWall(this.normal, this.elasticity, this.elasticityFalloff, this.friction, this.scatter)

		// manage item-specific logic
		if (this.obj && this.fe && dot >= this.threshold && this.obj.onCollision) {
			this.obj.onCollision(this, ball, dot)
		}
	}

	public isDegenerate(): boolean {
		return this.normal.isZero()
	}
}
