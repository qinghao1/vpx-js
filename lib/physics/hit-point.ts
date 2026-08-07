// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { PlayerPhysics } from '../game/player-physics.js'
import { FRect3D } from '../math/frect3d.js'
import { solveQuadraticEq } from '../math/functions.js'
import { Vertex3D } from '../math/vertex3d.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { CollisionEvent } from './collision-event.js'
import { C_CONTACTVEL, PHYS_TOUCH } from './constants.js'
import { HitObject } from './hit-object.js'

export class HitPoint extends HitObject {
	private readonly p: Vertex3D

	constructor(p: Vertex3D) {
		super()
		this.p = p
	}

	public calcHitBBox(): void {
		this.hitBBox = new FRect3D(this.p.x, this.p.x, this.p.y, this.p.y, this.p.z, this.p.z)
	}

	public hitTest(ball: Ball, dTime: number, coll: CollisionEvent, physics: PlayerPhysics): number {
		if (!this.isEnabled) {
			return -1.0
		}

		// relative ball position
		const dist = ball.state.pos.clone(true).sub(this.p)

		const bcddsq = dist.lengthSq() // ball center to line distance squared
		const bcdd = Math.sqrt(bcddsq) // distance ball to line
		if (bcdd <= 1.0e-6) {
			Vertex3D.release(dist)
			return -1.0 // no hit on exact center
		}

		const b = dist.dot(ball.hit.vel)
		const bnv = b / bcdd // ball normal velocity
		Vertex3D.release(dist)

		if (bnv > C_CONTACTVEL) {
			return -1.0 // clearly receding from radius
		}

		const bnd = bcdd - ball.data.radius // ball distance to line
		const a = ball.hit.vel.lengthSq()

		let hitTime = 0
		let isContact = false

		if (bnd < PHYS_TOUCH) {
			// already in collision distance?
			if (Math.abs(bnv) <= C_CONTACTVEL) {
				isContact = true
				hitTime = 0
			} else {
				// estimate based on distance and speed along distance
				hitTime = Math.max(0.0, -bnd / bnv)
			}
		} else {
			if (a < 1.0e-8) {
				return -1.0 // no hit - ball not moving relative to object
			}

			const sol = solveQuadraticEq(a, 2.0 * b, bcddsq - ball.data.radius * ball.data.radius)
			if (!sol) {
				return -1.0
			}
			const time1 = sol[0]
			const time2 = sol[1]

			// find smallest non-negative solution
			hitTime = time1 * time2 < 0 ? Math.max(time1, time2) : Math.min(time1, time2)
		}

		if (!isFinite(hitTime) || hitTime < 0 || hitTime > dTime) {
			return -1.0 // contact out of physics frame
		}

		const hitVel = ball.hit.vel.clone(true).multiplyScalar(hitTime)
		const hitNormal = ball.state.pos.clone(true).add(hitVel).sub(this.p).normalize()
		coll.hitNormal.set(hitNormal)
		Vertex3D.release(hitVel, hitNormal)

		coll.isContact = isContact
		if (isContact) {
			coll.hitOrgNormalVelocity = bnv
		}

		coll.hitDistance = bnd // actual contact distance
		//coll.m_hitRigid = true;

		return hitTime
	}

	public collide(coll: CollisionEvent): void {
		const dot = coll.hitNormal.dot(coll.ball.hit.vel)
		coll.ball.hit.collide3DWall(coll.hitNormal, this.elasticity, this.elasticityFalloff, this.friction, this.scatter)

		if (dot <= -this.threshold) {
			this.fireHitEvent(coll.ball)
		}
	}
}
