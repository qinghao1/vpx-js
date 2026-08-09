// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Vertex3D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { C_CONTACTVEL, PHYS_TOUCH } from './constants.js'
import { HitObject } from './hit-object.js'

/** Point hit shape.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.cpp */
export class HitPoint extends HitObject {
	constructor(private readonly p: Vertex3D) {
		super()
	}

	public override calcHitBBox(): void {
		const b = this.hitBBox;
		b.left = b.right = this.p.x;
		b.top = b.bottom = this.p.y;
		b.zlow = b.zhigh = this.p.z;
	}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent): number {
		if (!this.isEnabled) return -1
		const px = this.p.x, py = this.p.y, pz = this.p.z;
		const bx = ball.state.pos.x, by = ball.state.pos.y, bz = ball.state.pos.z;
		const vx = ball.hit.vel.x, vy = ball.hit.vel.y, vz = ball.hit.vel.z;
		const dx = bx - px, dy = by - py, dz = bz - pz;
		const bcddsq = dx*dx+dy*dy+dz*dz;
		const bcdd = Math.sqrt(bcddsq);
		if (bcdd <= 1e-6) return -1;
		const b = dx*vx + dy*vy + dz*vz;
		const bnv = b / bcdd;
		if (bnv > C_CONTACTVEL) return -1;
		const bnd = bcdd - ball.data.radius;
		const a = vx*vx+vy*vy+vz*vz;
		let hitTime = 0, isContact = false;
		if (bnd < PHYS_TOUCH) {
			if (Math.abs(bnv) <= C_CONTACTVEL) isContact = true;
			else hitTime = Math.max(0, -bnd / bnv);
		} else {
			if (a < 1e-8) return -1;
			const discr = 4 * b * b - 4 * a * (bcddsq - ball.data.radius * ball.data.radius)
			if (discr < 0) return -1
			const s = Math.sqrt(discr)
			const inv = -0.5 / a
			const t1 = (2 * b + s) * inv
			const t2 = (2 * b - s) * inv
			hitTime = t1 * t2 < 0 ? Math.max(t1, t2) : Math.min(t1, t2)
		}
		if (!Number.isFinite(hitTime) || hitTime < 0 || hitTime > dTime) return -1;
		const hx = bx + vx*hitTime, hy = by + vy*hitTime, hz = bz + vz*hitTime;
		const nx = hx - px, ny = hy - py, nz = hz - pz;
		const len = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
		coll.hitNormal.x = nx/len; coll.hitNormal.y = ny/len; coll.hitNormal.z = nz/len;
		coll.isContact = isContact;
		if (isContact) coll.hitOrgNormalVelocity = bnv;
		coll.hitDistance = bnd;
		return hitTime;
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
