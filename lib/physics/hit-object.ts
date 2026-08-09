// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../game/event.js'
import type { EventProxy } from '../game/event-proxy.js'
import type { PlayerPhysics } from '../game/player-physics.js'
import { degToRad } from '../util/float.js'
import { FRect3D } from '../util/frect3d.js'
import { Vertex3D } from '../util/math.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { IPhysicalData } from '../vpt/item-data.js'
import type { Table } from '../vpt/table/table.js'
import { CollisionEvent } from './collision-event.js'
import { CollisionType } from './collision-type.js'

/** Base for all collidable shapes.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.h */
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

export abstract class HitObject {
	/** @deprecated use {@link eventProxy} */
	public obj?: EventProxy
	public threshold = 0
	public hitBBox: FRect3D = new FRect3D()
	public elasticity = 0.3
	public elasticityFalloff = 0
	public friction = 0.3
	/** Scatter angle in radians. */
	public scatter = 0
	protected objType: CollisionType = CollisionType.Null
	public isEnabled = true
	public hitKind: HitKind = HitKind.Other
	/** @deprecated use {@link fireEvents} */
	public fe = false
	/** @deprecated use {@link isPrimitive} */
	public e = false

	public get eventProxy(): EventProxy | undefined {
		return this.obj
	}
	public set eventProxy(v: EventProxy | undefined) {
		this.obj = v
	}
	public get fireEvents(): boolean {
		return this.fe
	}
	public set fireEvents(v: boolean) {
		this.fe = v
	}
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
			if (distLs > normalDist) this.obj?.fireGroupEvent(Event.HitEventsHit)
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
		if (!physics.recordContacts) {
			const t = this.hitTest(ball, coll.hitTime, coll, physics)
			if (t >= 0 && t <= coll.hitTime) {
				coll.ball = ball
				coll.obj = this
				coll.hitTime = t
			}
			return
		}
		const newColl = CollisionEvent.claim(ball)
		const newTime = this.hitTest(ball, coll.hitTime, newColl, physics)
		const validHit = newTime >= 0 && newTime <= coll.hitTime
		if (newColl.isContact || validHit) {
			newColl.ball = ball
			newColl.obj = this
			if (newColl.isContact) physics.contacts.push(newColl)
			else {
				coll.set(newColl)
				coll.hitTime = newTime
				CollisionEvent.releaseOne(newColl)
			}
		} else {
			CollisionEvent.releaseOne(newColl)
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
