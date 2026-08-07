// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex2D } from '../math/vertex2d.js'
import { Vertex3D } from '../math/vertex3d.js'
import { Pool } from '../util/object-pool.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { HitObject } from './hit-object.js'

/**
 * Collision contact — narrowphase result for ball vs hit shape.
 * @see https://github.com/vpinball/vpinball/blob/master/collide.h
 */
export class CollisionEvent {
	private static readonly POOL = new Pool(CollisionEvent)

	public ball!: Ball
	public obj?: HitObject
	public isContact = false
	public hitTime = 0
	public hitDistance = 0
	public readonly hitNormal = new Vertex3D()
	public hitVel = new Vertex2D()
	public hitOrgNormalVelocity = 0
	public hitMomentBit = true
	public hitFlag = false

	constructor(ball?: Ball) {
		if (ball) this.ball = ball
	}

	public static claim(ball: Ball): CollisionEvent {
		const e = CollisionEvent.POOL.get()
		e.ball = ball
		return e
	}

	public static release(...events: CollisionEvent[]): void {
		for (const e of events) CollisionEvent.POOL.release(e)
	}

	public static reset(e: CollisionEvent): void {
		Reflect.deleteProperty(e as unknown as Record<string, unknown>, 'ball')
		delete e.obj
		e.isContact = false
		e.hitTime = 0
		e.hitDistance = 0
		e.hitNormal.setZero()
		e.hitVel.setZero()
		e.hitOrgNormalVelocity = 0
		e.hitMomentBit = true
		e.hitFlag = false
	}

	public clear(): void {
		this.obj = undefined
	}

	public set(coll: CollisionEvent): this {
		this.ball = coll.ball
		this.obj = coll.obj
		this.isContact = coll.isContact
		this.hitTime = coll.hitTime
		this.hitDistance = coll.hitDistance
		this.hitNormal.set(coll.hitNormal)
		this.hitVel.set(coll.hitVel.x, coll.hitVel.y)
		this.hitOrgNormalVelocity = coll.hitOrgNormalVelocity
		this.hitMomentBit = coll.hitMomentBit
		this.hitFlag = coll.hitFlag
		return this
	}
}
