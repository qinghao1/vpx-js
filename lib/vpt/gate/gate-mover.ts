// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import type { PlayerPhysics } from '../../game/player-physics.js'
import { radToDeg } from '../../math/float.js'
import { PHYS_FACTOR } from '../../physics/constants.js'
import type { MoverObject } from '../../physics/mover-object.js'
import type { GateData } from './gate-data.js'
import type { GateState } from './gate-state.js'

/** Gate mover. */
export class GateMover implements MoverObject {
	private readonly data: GateData
	private readonly state: GateState
	private readonly events: EventProxy

	public angleSpeed: number
	public angleMin: number
	public angleMax: number
	public friction: number
	public damping: number
	public gravityFactor: number
	public open: boolean // True if the table logic is opening the gate, not just the ball passing through
	public forcedMove: boolean // True if the table logic is opening/closing the gate

	constructor(data: GateData, state: GateState, events: EventProxy) {
		this.data = data
		this.state = state
		this.events = events

		this.angleMin = this.data.angleMin
		this.angleMax = this.data.angleMax

		this.friction = this.data.friction

		this.state.angle = this.angleMin
		this.angleSpeed = 0.0
		this.damping = this.data.damping ** PHYS_FACTOR //0.996f;
		this.gravityFactor = this.data.gravityFactor

		this.open = false
		this.forcedMove = false
	}

	public updateDisplacements(dtime: number): void {
		if (this.data.twoWay) {
			if (Math.abs(this.state.angle) > this.angleMax) {
				if (this.state.angle < 0.0) {
					this.state.angle = -this.angleMax
				} else {
					this.state.angle = this.angleMax
				}
				this.events.fireVoidEventParm(Event.LimitEventsEOS, Math.abs(radToDeg(this.angleSpeed))) // send EOS event
				if (!this.forcedMove) {
					this.angleSpeed = -this.angleSpeed
					this.angleSpeed *= this.damping * 0.8 // just some extra damping to reduce the angleSpeed a bit faster
				} else if (this.angleSpeed > 0.0) {
					this.angleSpeed = 0.0
				}
			}
			if (Math.abs(this.state.angle) < this.angleMin) {
				if (this.state.angle < 0.0) {
					this.state.angle = -this.angleMin
				} else {
					this.state.angle = this.angleMin
				}
				if (!this.forcedMove) {
					this.angleSpeed = -this.angleSpeed
					this.angleSpeed *= this.damping * 0.8 // just some extra damping to reduce the angleSpeed a bit faster
				} else if (this.angleSpeed < 0.0) {
					this.angleSpeed = 0.0
				}
			}
		} else {
			if (this.state.angle > this.angleMax) {
				this.state.angle = this.angleMax
				this.events.fireVoidEventParm(Event.LimitEventsEOS, Math.abs(radToDeg(this.angleSpeed))) // send EOS event
				if (!this.forcedMove) {
					this.angleSpeed = -this.angleSpeed
					this.angleSpeed *= this.damping * 0.8 // just some extra damping to reduce the angleSpeed a bit faster
				} else if (this.angleSpeed > 0.0) {
					this.angleSpeed = 0.0
				}
			}
			if (this.state.angle < this.angleMin) {
				this.state.angle = this.angleMin
				this.events.fireVoidEventParm(Event.LimitEventsBOS, Math.abs(radToDeg(this.angleSpeed))) // send Park event
				if (!this.forcedMove) {
					this.angleSpeed = -this.angleSpeed
					this.angleSpeed *= this.damping * 0.8 // just some extra damping to reduce the angleSpeed a bit faster
				} else if (this.angleSpeed < 0.0) {
					this.angleSpeed = 0.0
				}
			}
		}
		this.state.angle += this.angleSpeed * dtime
	}

	public updateVelocities(physics: PlayerPhysics): void {
		if (!this.open) {
			if (Math.abs(this.state.angle) < this.angleMin + 0.01 && Math.abs(this.angleSpeed) < 0.01) {
				// stop a bit earlier to prevent a nearly endless animation (especially for slow balls)
				this.state.angle = this.angleMin
				this.angleSpeed = 0.0
			}
			if (Math.abs(this.angleSpeed) !== 0.0 && this.state.angle !== this.angleMin) {
				this.angleSpeed -= Math.sin(this.state.angle) * this.gravityFactor * (PHYS_FACTOR / 100.0) // Center of gravity towards bottom of object, makes it stop vertical
				this.angleSpeed *= this.damping
			}
		}
	}
}
