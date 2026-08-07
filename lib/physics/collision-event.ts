// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex2D } from '../math/vertex2d.js'
import { Vertex3D } from '../math/vertex3d.js'
import { Pool } from '../util/object-pool.js'
import type { Ball } from '../vpt/ball/ball.js'
import type { HitObject } from './hit-object.js'

export class CollisionEvent {
	private static readonly POOL = new Pool(CollisionEvent)

	/**
	 * The ball that collided with something
	 */
	public ball: Ball

	/**
	 * What the ball collided with
	 */
	public obj?: HitObject

	/**
	 * Set to true if impact velocity is ~0
	 */
	public isContact: boolean = false

	/**
	 * When the collision happens (relative to current physics state)
	 */
	public hitTime: number = 0

	/**
	 * Hit distance
	 */
	public hitDistance: number = 0

	/**
	 * Additional collision information
	 */
	public readonly hitNormal: Vertex3D = new Vertex3D()

	/**
	 * Only "correctly" used by plunger and flipper
	 */
	public hitVel: Vertex2D = new Vertex2D()

	/**
	 * Only set if isContact is true
	 */
	public hitOrgNormalVelocity: number = 0

	/**
	 * Currently only one bit is used (hitmoment == 0 or not)
	 */
	public hitMomentBit: boolean = true

	/**
	 * UnHit signal/direction of hit/side of hit (spinner/gate)
	 */
	public hitFlag: boolean = false

	constructor(ball?: Ball) {
		this.ball = ball!
	}

	public static claim(ball: Ball): CollisionEvent {
		const event = CollisionEvent.POOL.get()
		event.ball = ball
		return event
	}

	public static release(...events: CollisionEvent[]) {
		for (const event of events) {
			CollisionEvent.POOL.release(event)
		}
	}

	public static reset(event: CollisionEvent): void {
		delete event.ball
		delete event.obj
		event.isContact = false
		event.hitTime = 0
		event.hitDistance = 0
		event.hitNormal.setZero()
		event.hitVel.setZero()
		event.hitOrgNormalVelocity = 0
		event.hitMomentBit = true
		event.hitFlag = false
	}

	public clear() {
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
