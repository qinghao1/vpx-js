// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import type { Vertex3D } from '../util/vector.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { C_CONTACTVEL, PHYS_TOUCH } from './constants.js'
import { HitKind, HitObject } from './hit-object.js'

/** Infinite plane (playfield / glass).
 * @see https://github.com/vpinball/vpinball/blob/master/collide.cpp */
export class HitPlane extends HitObject {
	public override hitKind = HitKind.Plane
	constructor(
		public readonly normal: Vertex3D,
		public readonly d: number,
	) {
		super()
	}

	public override calcHitBBox(): void {}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent, _physics?: PlayerPhysics): number {
		if (!this.isEnabled) return -1
		const bnv = this.normal.dot(ball.hit.vel)
		if (bnv > C_CONTACTVEL) return -1
		const bnd = this.normal.dot(ball.state.pos) - ball.data.radius - this.d
		if (bnd < ball.data.radius * -2) return -1
		if (Math.abs(bnv) <= C_CONTACTVEL) {
			if (Math.abs(bnd) > PHYS_TOUCH) return -1
			coll.isContact = true
			coll.hitNormal.set(this.normal)
			coll.hitOrgNormalVelocity = bnv
			coll.hitDistance = bnd
			return 0
		}
		let hitTime = bnd / -bnv
		if (hitTime < 0) hitTime = 0
		if (!Number.isFinite(hitTime) || hitTime < 0 || hitTime > dTime) return -1
		coll.hitNormal.set(this.normal)
		coll.hitDistance = bnd
		return hitTime
	}

	public override collide(coll: CollisionEvent, _physics?: PlayerPhysics): void {
		coll.ball.hit.collide3DWall(
			coll.hitNormal,
			this.elasticity,
			this.elasticityFalloff,
			this.friction,
			this.scatter,
		)
		const bnd = this.normal.dot(coll.ball.state.pos) - coll.ball.data.radius - this.d
		if (bnd >= 0) return
		coll.ball.state.pos.x -= this.normal.x * bnd
		coll.ball.state.pos.y -= this.normal.y * bnd
		coll.ball.state.pos.z -= this.normal.z * bnd
	}
}
