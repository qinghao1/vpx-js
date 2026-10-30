// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'

import { Event } from '../game/event.js'
import type { EventProxy } from '../game/event-proxy.js'
import type { PlayerPhysics } from '../game/player-physics.js'
import { FRect3D } from '../math/bounds.js'
import { Vertex3D } from '../math/vector.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { IPhysicalData } from '../vpt/item-data.js'
import type { Table } from '../vpt/table/table.js'
import { CollisionEvent } from './collision-event.js'
import { CollisionType } from './collision-type.js'

export enum HitKind {
	Circle = 0,
	Plane = 1,
	LineZ = 2,
	Line3D = 3,
	Point = 4,
	Triangle = 5,
	LineSeg = 6,
	Poly = 7,
	Other = 8,
}

/** Base for all collidable shapes.
 * @see https://github.com/vpinball/vpinball/blob/master/src/physics/collide.h (HitObject) */
export abstract class HitObject {
	public obj?: EventProxy
	public threshold = 0
	public hitBBox: FRect3D = new FRect3D()
	public elasticity = 0.3
	public elasticityFalloff = 0
	public friction = 0.3
	/** Scatter angle in radians. */
	public scatter = 0
	public objType: CollisionType = CollisionType.Null
	public isEnabled = true
	public hitKind: HitKind = HitKind.Other
	public fe = false
	public e = false

	abstract calcHitBBox(): void
	abstract hitTest(ball: Ball, dTime: number, coll: CollisionEvent, physics: PlayerPhysics): number
	abstract collide(coll: CollisionEvent, physics: PlayerPhysics): void

	/** Apply contact forces for the interval. */
	contact(coll: CollisionEvent, dTime: number, physics: PlayerPhysics): void {
		coll.ball.hit.handleStaticContact(coll, this.friction, dTime, physics)
	}

	setFriction(friction: number): this {
		this.friction = friction
		return this
	}
	setScatter(scatter: number): this {
		this.scatter = scatter
		return this
	}
	fireHitEvent(ball: Ball): void {
		if (this.obj && this.fe && this.isEnabled) {
			// Upstream HitObject::FireHitEvent (collide.cpp): hits while the
			// ball barely travelled since the last event are rest-contact noise
			// and only re-fire from a new place; hits after real travel always
			// fire. Suppressed hits keep the anchor so slow drift still
			// re-fires once it leaves the spot; the accumulator (fed by
			// BallMover) resets on every fire.
			if (ball.hit.lastEventSqrDist < 0.5) {
				const posDiff = ball.hit.eventPos.clone(true).sub(ball.state.pos)
				const distLs = posDiff.lengthSq()
				Vertex3D.release(posDiff)
				const normalDist = this.objType === CollisionType.HitTarget ? 0 : 0.25
				if (distLs <= normalDist) return
			}
			ball.hit.lastEventSqrDist = 0
			ball.hit.eventPos.set(ball.state.pos.x, ball.state.pos.y, ball.state.pos.z)
			this.obj.fireGroupEvent(Event.HitEventsHit)
		}
	}
	setElasticity(elasticity: number, elasticityFalloff?: number): this {
		this.elasticity = elasticity
		if (elasticityFalloff !== undefined) this.elasticityFalloff = elasticityFalloff
		return this
	}
	setZ(zLow: number, zHigh: number): this {
		this.hitBBox.zlow = zLow
		this.hitBBox.zhigh = zHigh
		return this
	}
	setEnabled(isEnabled: boolean): void {
		this.isEnabled = isEnabled
	}
	setType(type: CollisionType): void {
		this.objType = type
	}
	doHitTest(ball: Ball, coll: CollisionEvent, physics: PlayerPhysics): void {
		if (!ball) return
		if (this.obj?.abortHitTest?.()) return
		// Per-call scratch: miss-path writes (normal, distance, flags) land
		// here and are discarded, so a miss never clobbers the hit in coll.
		// Each call owns its instance, so nested doHitTest calls stay independent.
		const scratch = CollisionEvent.claim(ball)
		const newTime = this.hitTest(ball, coll.hitTime, scratch, physics)
		const validHit = newTime >= 0 && newTime <= coll.hitTime
		if (!physics.recordContacts) {
			if (validHit) {
				coll.set(scratch)
				coll.obj = this
				coll.hitTime = newTime
			}
			CollisionEvent.releaseOne(scratch)
			return
		}
		if (scratch.isContact || validHit) {
			if (scratch.isContact) {
				scratch.obj = this
				physics.contacts.push(scratch)
			} else {
				coll.set(scratch)
				coll.obj = this
				coll.hitTime = newTime
				CollisionEvent.releaseOne(scratch)
			}
		} else CollisionEvent.releaseOne(scratch)
	}
	applyPhysics(data: IPhysicalData, table: Table): void {
		const mat = table.getMaterial(data.szPhysicsMaterial)
		if (mat && !data.overwritePhysics) {
			this.setElasticity(mat.elasticity, mat.elasticityFalloff)
			this.setFriction(mat.friction)
			this.setScatter(MathUtils.degToRad(mat.scatterAngle))
		} else {
			this.setElasticity(data.elasticity, data.elasticityFalloff)
			this.setFriction(data.friction)
			this.setScatter(MathUtils.degToRad(data.scatter))
		}
		this.setEnabled(data.isCollidable)
	}
}
