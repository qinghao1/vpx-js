// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import { Vertex3D } from '../util/vector.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { C_CONTACTVEL, C_LOWNORMVEL, PHYS_TOUCH } from './constants.js'
import { HitKind, HitObject } from './hit-object.js'

/** Triangular hit face.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.cpp */
export class HitTriangle extends HitObject {
	public override hitKind = HitKind.Triangle
	public readonly normal: Vertex3D

	constructor(public readonly rgv: Vertex3D[]) {
		super()
		const r0 = this.rgv[0],
			r1 = this.rgv[1],
			r2 = this.rgv[2]
		const e0x = r2.x - r0.x,
			e0y = r2.y - r0.y,
			e0z = r2.z - r0.z
		const e1x = r1.x - r0.x,
			e1y = r1.y - r0.y,
			e1z = r1.z - r0.z
		const nx = e0y * e1z - e0z * e1y,
			ny = e0z * e1x - e0x * e1z,
			nz = e0x * e1y - e0y * e1x
		const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
		this.normal = new Vertex3D(nx / len, ny / len, nz / len)
		this.elasticity = 0.3
		this.setFriction(0.3)
		this.scatter = 0
	}

	public override calcHitBBox(): void {
		const b = this.hitBBox
		b.left = Math.min(this.rgv[0].x, this.rgv[1].x, this.rgv[2].x)
		b.right = Math.max(this.rgv[0].x, this.rgv[1].x, this.rgv[2].x)
		b.top = Math.min(this.rgv[0].y, this.rgv[1].y, this.rgv[2].y)
		b.bottom = Math.max(this.rgv[0].y, this.rgv[1].y, this.rgv[2].y)
		b.zlow = Math.min(this.rgv[0].z, this.rgv[1].z, this.rgv[2].z)
		b.zhigh = Math.max(this.rgv[0].z, this.rgv[1].z, this.rgv[2].z)
	}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent, _physics?: PlayerPhysics): number {
		if (!this.isEnabled) return -1
		const nx = this.normal.x,
			ny = this.normal.y,
			nz = this.normal.z
		const vx = ball.hit.vel.x,
			vy = ball.hit.vel.y,
			vz = ball.hit.vel.z
		const bnv = nx * vx + ny * vy + nz * vz
		if (bnv > C_CONTACTVEL) return -1
		const bx = ball.state.pos.x,
			by = ball.state.pos.y,
			bz = ball.state.pos.z
		const r = ball.data.radius
		const hx = bx - nx * r,
			hy = by - ny * r,
			hz = bz - nz * r
		const r0 = this.rgv[0]
		const bnd = nx * (hx - r0.x) + ny * (hy - r0.y) + nz * (hz - r0.z)
		if (bnd < -r) return -1
		let isContact = false,
			hitTime = 0
		if (bnd <= PHYS_TOUCH) {
			if (Math.abs(bnv) <= C_CONTACTVEL) {
				hitTime = 0
				isContact = true
			} else if (bnd <= 0) hitTime = 0
			else hitTime = bnd / -bnv
		} else if (Math.abs(bnv) > C_LOWNORMVEL) hitTime = bnd / -bnv
		else return -1
		if (!Number.isFinite(hitTime) || hitTime < 0 || hitTime > dTime) return -1
		const hpx = hx + vx * hitTime,
			hpy = hy + vy * hitTime,
			hpz = hz + vz * hitTime
		const r1 = this.rgv[1],
			r2 = this.rgv[2]
		const v0x = r2.x - r0.x,
			v0y = r2.y - r0.y,
			v0z = r2.z - r0.z
		const v1x = r1.x - r0.x,
			v1y = r1.y - r0.y,
			v1z = r1.z - r0.z
		const v2x = hpx - r0.x,
			v2y = hpy - r0.y,
			v2z = hpz - r0.z
		const dot00 = v0x * v0x + v0y * v0y + v0z * v0z
		const dot01 = v0x * v1x + v0y * v1y + v0z * v1z
		const dot02 = v0x * v2x + v0y * v2y + v0z * v2z
		const dot11 = v1x * v1x + v1y * v1y + v1z * v1z
		const dot12 = v1x * v2x + v1y * v2y + v1z * v2z
		const invDenom = 1 / (dot00 * dot11 - dot01 * dot01)
		const u = (dot11 * dot02 - dot01 * dot12) * invDenom
		const v = (dot00 * dot12 - dot01 * dot02) * invDenom
		if (u < 0 || v < 0 || u + v > 1) return -1
		coll.hitNormal.x = nx
		coll.hitNormal.y = ny
		coll.hitNormal.z = nz
		coll.hitDistance = bnd
		if (isContact) {
			coll.isContact = true
			coll.hitOrgNormalVelocity = bnv
		}
		return hitTime
	}

	public override collide(coll: CollisionEvent, _physics?: PlayerPhysics): void {
		const ball = coll.ball
		const dot = -coll.hitNormal.dot(ball.hit.vel)
		ball.hit.collide3DWall(this.normal, this.elasticity, this.elasticityFalloff, this.friction, this.scatter)
		if (this.obj && this.fe && dot >= this.threshold && this.obj.onCollision) this.obj.onCollision(this, ball, dot)
	}

	public isDegenerate(): boolean {
		return this.normal.isZero()
	}
}
