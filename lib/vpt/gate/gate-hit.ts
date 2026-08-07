// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import type { CollisionEvent } from '../../physics/collision-event.js'
import { CollisionType } from '../../physics/collision-type.js'
import { PHYS_SKIN } from '../../physics/constants.js'
import { HitObject } from '../../physics/hit-object.js'
import { LineSeg } from '../../physics/line-seg.js'
import { degToRad } from '../../util/float.js'
import { Vertex2D } from '../../util/math.js'
import type { Ball } from '../ball/ball.js'
import type { GateData } from './gate-data.js'
import { GateMover } from './gate-mover.js'
import type { GateState } from './gate-state.js'

/** Gate hit — two-sided line segments. @see https://github.com/vpinball/vpinball/blob/master/gate.cpp */
export class GateHit extends HitObject {
	public readonly mover: GateMover
	public readonly lineSeg: LineSeg[] = []
	public twoWay = false

	constructor(
		private readonly data: GateData,
		state: GateState,
		events: EventProxy,
		height: number,
	) {
		super()
		const hl = data.length * 0.5
		const rad = degToRad(data.rotation)
		const sn = Math.sin(rad)
		const cs = Math.cos(rad)
		const v1 = new Vertex2D(data.center.x - cs * (hl + PHYS_SKIN), data.center.y - sn * (hl + PHYS_SKIN))
		const v2 = new Vertex2D(data.center.x + cs * (hl + PHYS_SKIN), data.center.y + sn * (hl + PHYS_SKIN))
		const z0 = height
		const z1 = height + 2 * PHYS_SKIN
		this.lineSeg.push(
			new LineSeg(v1, v2, z0, z1, CollisionType.Gate),
			new LineSeg(v2.clone(), v1.clone(), z0, z1, CollisionType.Gate),
		)
		this.mover = new GateMover(data, state, events)
	}

	public getMoverObject(): GateMover {
		return this.mover
	}

	public override calcHitBBox(): void {
		this.lineSeg[0]!.calcHitBBox()
		this.hitBBox = this.lineSeg[0]!.hitBBox
	}

	public override hitTest(ball: Ball, dTime: number, coll: CollisionEvent, _physics: PlayerPhysics): number {
		if (!this.isEnabled) return -1
		for (let i = 0; i < 2; i++) {
			const t = this.lineSeg[i]!.hitTestBasic(ball, dTime, coll, false, true, false)
			if (t >= 0) {
				coll.hitFlag = !!i
				return t
			}
		}
		return -1
	}

	public override collide(coll: CollisionEvent, _physics: PlayerPhysics): void {
		const ball = coll.ball
		const h = this.data.height * 0.5
		let speed = Math.abs(coll.hitNormal.dot(ball.hit.vel))
		if (Math.abs(h) > 1) speed /= h
		this.mover.angleSpeed = speed
		if (!coll.hitFlag && !this.twoWay) {
			this.mover.angleSpeed /= 8
			return
		}
		if (coll.hitFlag && this.twoWay) this.mover.angleSpeed = -this.mover.angleSpeed
		this.fireHitEvent(ball)
	}
}
