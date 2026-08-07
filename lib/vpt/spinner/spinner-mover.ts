// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Event } from '../../game/event.js'
import type { EventProxy } from '../../game/event-proxy.js'
import { degToRad, radToDeg } from '../../math/float.js'
import { PHYS_FACTOR } from '../../physics/constants.js'
import type { MoverObject } from '../../physics/mover-object.js'
import type { SpinnerData } from './spinner-data.js'
import type { SpinnerState } from './spinner-state.js'

/** Spinner mover. */
export class SpinnerMover implements MoverObject {
	private readonly data: SpinnerData
	private readonly state: SpinnerState
	private readonly events: EventProxy

	public angleSpeed: number = 0
	public angleMax: number
	public angleMin: number
	public elasticity: number
	public damping: number

	constructor(data: SpinnerData, state: SpinnerState, events: EventProxy) {
		this.data = data
		this.state = state
		this.events = events

		this.angleMax = degToRad(data.angleMax)
		this.angleMin = degToRad(data.angleMin)

		// compute proper damping factor for physics framerate
		this.damping = data.damping ** PHYS_FACTOR

		this.elasticity = data.elasticity
	}

	public updateDisplacements(dTime: number): void {
		if (this.data.angleMin !== this.data.angleMax) {
			// blocked spinner, limited motion spinner

			this.state.angle += this.angleSpeed * dTime

			if (this.state.angle > this.angleMax) {
				this.state.angle = this.angleMax
				this.events.fireVoidEventParm(Event.LimitEventsEOS, Math.abs(radToDeg(this.angleSpeed))) // send EOS event

				if (this.angleSpeed > 0) {
					this.angleSpeed *= -0.005 - this.elasticity
				}
			}
			if (this.state.angle < this.angleMin) {
				this.state.angle = this.angleMin
				this.events.fireVoidEventParm(Event.LimitEventsBOS, Math.abs(radToDeg(this.angleSpeed))) // send Park event

				if (this.angleSpeed < 0) {
					this.angleSpeed *= -0.005 - this.elasticity
				}
			}
		} else {
			// "normal" 360° spinner
			const target =
				this.angleSpeed > 0
					? this.state.angle < Math.PI
						? Math.PI
						: 3.0 * Math.PI
					: this.state.angle < Math.PI
						? -Math.PI
						: Math.PI

			this.state.angle += this.angleSpeed * dTime

			if (this.angleSpeed > 0) {
				if (this.state.angle > target) {
					this.events.fireGroupEvent(Event.SpinnerEventsSpin)
				}
			} else {
				if (this.state.angle < target) {
					this.events.fireGroupEvent(Event.SpinnerEventsSpin)
				}
			}

			// clamp angle between 0 and 2π
			while (this.state.angle > 2.0 * Math.PI) {
				this.state.angle -= 2.0 * Math.PI
			}
			while (this.state.angle < 0.0) {
				this.state.angle += 2.0 * Math.PI
			}
		}
	}

	public updateVelocities(): void {
		this.angleSpeed -= Math.sin(this.state.angle) * (0.0025 * PHYS_FACTOR) // Center of gravity towards bottom of object, makes it stop vertical
		this.angleSpeed *= this.damping
	}
}
