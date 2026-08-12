// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { MathUtils } from 'three'

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { PHYS_FACTOR } from '../../physics/constants.js'
import type { MoverObject } from '../../physics/mover-object.js'
import type { GateData } from './gate-data.js'
import type { GateState } from './gate-state.js'

/** Gate mover — swings open/closed with damping and gravity. @see https://github.com/vpinball/vpinball/blob/master/gate.cpp */
export class GateMover implements MoverObject {
	public angleSpeed = 0
	public angleMin: number
	public angleMax: number
	public friction: number
	public damping: number
	public gravityFactor: number
	public open = false
	public forcedMove = false
	public hitDirection = false

	constructor(
		private readonly data: GateData,
		private readonly state: GateState,
		private readonly events: EventProxy,
	) {
		this.angleMin = Math.min(data.angleMin, data.angleMax)
		this.angleMax = Math.max(data.angleMin, data.angleMax)
		this.friction = data.friction
		this.state.angle = this.angleMin
		this.damping = data.damping ** PHYS_FACTOR
		this.gravityFactor = data.gravityFactor
	}

	public updateDisplacements(dtime: number): void {
		const spd = Math.abs(MathUtils.radToDeg(this.angleSpeed))
		if (this.data.twoWay) {
			if (Math.abs(this.state.angle) > this.angleMax) {
				this.state.angle = Math.sign(this.state.angle) * this.angleMax
				this.events.fireVoidEventParm(Event.LimitEventsEOS, spd)
				if (!this.forcedMove) {
					this.angleSpeed = -this.angleSpeed * this.damping * 0.8
				} else if (this.angleSpeed > 0) {
					this.angleSpeed = 0
				}
			}
			if (Math.abs(this.state.angle) < this.angleMin) {
				this.state.angle = Math.sign(this.state.angle || 1) * this.angleMin
				if (!this.forcedMove) {
					this.angleSpeed = -this.angleSpeed * this.damping * 0.8
				} else if (this.angleSpeed < 0) {
					this.angleSpeed = 0
				}
			}
		} else {
			const direction = this.hitDirection ? -1 : 1
			if (direction * this.state.angle > this.angleMax) {
				this.state.angle = direction * this.angleMax
				this.events.fireVoidEventParm(Event.LimitEventsEOS, spd)
				if (!this.forcedMove) {
					this.angleSpeed = -this.angleSpeed * this.damping * 0.8
				} else if (this.angleSpeed > 0) {
					this.angleSpeed = 0
				}
			}
			if (direction * this.state.angle < this.angleMin) {
				this.state.angle = direction * this.angleMin
				this.events.fireVoidEventParm(Event.LimitEventsBOS, spd)
				if (!this.forcedMove) {
					this.angleSpeed = -this.angleSpeed * this.damping * 0.8
				} else if (this.angleSpeed < 0) {
					this.angleSpeed = 0
				}
			}
		}
		if (this.angleSpeed === 0) this.forcedMove = false
		this.state.angle += this.angleSpeed * dtime
	}

	public updateVelocities(_physics: PlayerPhysics): void {
		if (this.open) return
		if (Math.abs(this.state.angle) < this.angleMin + 0.01 && Math.abs(this.angleSpeed) < 0.01) {
			this.state.angle = this.angleMin
			this.angleSpeed = 0
			return
		}
		if (Math.abs(this.angleSpeed) !== 0 && this.state.angle !== this.angleMin) {
			this.angleSpeed -= Math.sin(this.state.angle) * this.gravityFactor * (PHYS_FACTOR / 100)
			this.angleSpeed *= this.damping
		}
	}
}
