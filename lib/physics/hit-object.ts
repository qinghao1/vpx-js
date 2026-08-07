// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../game/event.js'
import type { EventProxy } from '../game/event-proxy.js'
import type { PlayerPhysics } from '../game/player-physics.js'
import { degToRad } from '../math/float.js'
import { FRect3D } from '../math/frect3d.js'
import { Vertex3D } from '../math/vertex3d.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { IPhysicalData } from '../vpt/item-data.js'
import type { Table } from '../vpt/table/table.js'
import { CollisionEvent } from './collision-event.js'
import { CollisionType } from './collision-type.js'

/**
 * Base for all collidable shapes.
 * Handles elasticity, friction, scatter, and event firing.
 */
export abstract class HitObject {
	/** @deprecated use eventProxy */
	public obj?: EventProxy

	/** Velocity threshold for firing hit events. */
	public threshold = 0

	/** Axis-aligned bounding box for broadphase. */
	public hitBBox: FRect3D = new FRect3D()

	public elasticity = 0.3
	public elasticityFalloff = 0
	public friction = 0.3
	/** Scatter angle in radians. */
	public scatter = 0

	protected objType: CollisionType = CollisionType.Null
	public isEnabled = true

	/** @deprecated use fireEvents */
	public fe = false

	/** @deprecated use isPrimitive */
	public e = false

	/** Event proxy for the owning item. */
	public get eventProxy(): EventProxy | undefined {
		return this.obj
	}
	public set eventProxy(v: EventProxy | undefined) {
		this.obj = v
	}

	/** Whether to fire hit events for this shape. */
	public get fireEvents(): boolean {
		return this.fe
	}
	public set fireEvents(v: boolean) {
		this.fe = v
	}

	/** Whether this shape belongs to a primitive group (for early-out). */
	public get isPrimitive(): boolean {
		return this.e
	}
	public set isPrimitive(v: boolean) {
		this.e = v
	}

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
			const posDiff = ball.hit.eventPos.clone(true).sub(ball.state.pos)
			const distLs = posDiff.lengthSq()
			Vertex3D.release(posDiff)
			ball.hit.eventPos.set(ball.state.pos.x, ball.state.pos.y, ball.state.pos.z)
			const normalDist = this.objType === CollisionType.HitTarget ? 0 : 0.25
			if (distLs > normalDist) this.obj!.fireGroupEvent(Event.HitEventsHit)
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

		const newColl = CollisionEvent.claim(ball)
		const newTime = this.hitTest(ball, coll.hitTime, !physics.recordContacts ? coll : newColl, physics)
		const validHit = newTime >= 0 && newTime <= coll.hitTime

		if (!physics.recordContacts) {
			if (validHit) {
				coll.ball = ball
				coll.obj = this
				coll.hitTime = newTime
			}
			CollisionEvent.release(newColl)
		} else {
			if (newColl.isContact || validHit) {
				newColl.ball = ball
				newColl.obj = this
				if (newColl.isContact) physics.contacts.push(newColl)
				else {
					coll.set(newColl)
					coll.hitTime = newTime
					CollisionEvent.release(newColl)
				}
			} else {
				CollisionEvent.release(newColl)
			}
		}
	}

	applyPhysics(data: IPhysicalData, table: Table): void {
		const mat = table.getMaterial(data.szPhysicsMaterial)
		if (mat && !data.overwritePhysics) {
			this.setElasticity(mat.elasticity, mat.elasticityFalloff)
			this.setFriction(mat.friction)
			this.setScatter(degToRad(mat.scatterAngle))
		} else {
			this.setElasticity(data.elasticity, data.elasticityFalloff)
			this.setFriction(data.friction)
			this.setScatter(degToRad(data.scatter))
		}
		this.setEnabled(data.isCollidable)
	}
}
