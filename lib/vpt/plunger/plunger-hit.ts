// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { Player } from '../../game/player.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { CollisionEvent } from '../../physics/collision-event.js'
import { C_DISP_GAIN, C_DISP_LIMIT, C_EMBEDDED, C_EMBEDSHOT, C_LOWNORMVEL } from '../../physics/constants.js'
import { HitObject } from '../../physics/hit-object.js'
import type { Ball } from '../ball/ball.js'
import type { Table } from '../table/table.js'
import { Plunger, type PlungerConfig } from './plunger.js'
import type { PlungerData } from './plunger-data.js'
import { PlungerMover } from './plunger-mover.js'
import type { PlungerState } from './plunger-state.js'

/** Plunger collision — static walls + moving tip. @see https://github.com/vpinball/vpinball/blob/master/plunger.cpp */
export class PlungerHit extends HitObject {
	private readonly mover: PlungerMover
	private readonly table: Table

	constructor(
		private readonly data: PlungerData,
		state: PlungerState,
		events: EventProxy,
		cFrames: number,
		player: Player,
		table: Table,
	) {
		super()
		this.table = table
		const z = table.getSurfaceHeight(data.szSurface, data.center.x, data.center.y)
		const cfg: PlungerConfig = {
			x: data.center.x - data.width,
			y: data.center.y + data.height,
			x2: data.center.x + data.width,
			zHeight: z,
			frameTop: data.center.y - data.stroke!,
			frameBottom: data.center.y,
			cFrames,
		}
		this.hitBBox.zlow = cfg.zHeight
		this.hitBBox.zhigh = cfg.zHeight + Plunger.PLUNGER_HEIGHT
		this.mover = new PlungerMover(cfg, data, state, events, player, table.getApi())
	}

	public getMoverObject(): PlungerMover {
		return this.mover
	}

	public override calcHitBBox(): void {
		this.hitBBox.left = this.mover.x - 0.1
		this.hitBBox.right = this.mover.x2 + 0.1
		this.hitBBox.top = this.mover.frameEnd - 0.1
		this.hitBBox.bottom = this.mover.y + 0.1
	}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent, physics: PlayerPhysics): number {
		let hitTime = dTime
		let isHit = false
		physics.lastPlungerHit = physics.timeMsec
		const hit = CollisionEvent.claim(ball)
		const test = (
			seg: { hitTest(ball: Ball, hitTime: number, hit: CollisionEvent): number },
			vel: { x: number; y: number },
		) => {
			const t = seg.hitTest(ball, hitTime, hit)
			if (t >= 0 && t <= hitTime) {
				isHit = true
				hitTime = t
				coll.set(hit)
				coll.hitVel.set(vel.x, vel.y)
			}
		}
		test(this.mover.lineSegBase, { x: 0, y: 0 })
		for (let i = 0; i < 2; i++) {
			test(this.mover.lineSegSide[i]!, { x: 0, y: 0 })
			test(this.mover.jointBase[i]!, { x: 0, y: 0 })
		}
		const oldVy = ball.hit.vel.y
		ball.hit.vel.y -= this.mover.speed
		const ballMass = Math.max(ball.data.mass, 0.05)
		const xfer = this.data.momentumXfer / ballMass
		const deltaY = this.mover.speed * xfer
		test(this.mover.lineSegEnd, { x: 0, y: deltaY })
		for (let i = 0; i < 2; i++) test(this.mover.jointEnd[i]!, { x: 0, y: deltaY })
		ball.hit.vel.y = oldVy
		CollisionEvent.release(hit)
		if (!isHit) return -1
		if (this.mover.travelLimit < this.mover.pos) this.mover.travelLimit = this.mover.pos
		if (coll.hitDistance <= 0 && coll.hitVel?.y === deltaY && Math.abs(deltaY) < Math.abs(coll.hitDistance))
			coll.hitVel!.y = -Math.abs(coll.hitDistance)
		return hitTime
	}

	public override collide(coll: CollisionEvent, physics: PlayerPhysics): void {
		const ball = coll.ball
		let dot =
			(ball.hit.vel.x - coll.hitVel?.x) * coll.hitNormal.x + (ball.hit.vel.y - coll.hitVel?.y) * coll.hitNormal.y
		if (dot >= -C_LOWNORMVEL) {
			if (dot > C_LOWNORMVEL) return
			if (coll.hitDistance < -C_EMBEDDED) dot = -C_EMBEDSHOT
			else return
		}
		physics.activeBallBC = ball
		let hDist = -C_DISP_GAIN * coll.hitDistance
		if (hDist > 1e-4) {
			if (hDist > C_DISP_LIMIT) hDist = C_DISP_LIMIT
			ball.state.pos.addAndRelease(coll.hitNormal.clone(true).multiplyScalar(hDist))
		}
		const impulse = (-1.45 * dot) / (1 + 1 / this.mover.mass)
		this.mover.fireBounce *= 0.6
		if (coll.hitVel?.y !== 0)
			this.mover.reverseImpulse = ball.hit.vel.y * impulse * (ball.data.mass / this.mover.mass) * 0.22
		ball.hit.vel.addAndRelease(coll.hitNormal.clone(true).multiplyScalar(impulse))
		ball.hit.vel.multiplyScalar(0.999)
		const sv = this.mover.scatterVelocity * this.table.getGlobalDifficulty()
		if (sv > 0 && Math.abs(ball.hit.vel.y) > sv) {
			let s = Math.random() * 2 - 1
			s *= (1 - s * s) * 2.59808 * sv
			ball.hit.vel.y += s
		}
	}
}
